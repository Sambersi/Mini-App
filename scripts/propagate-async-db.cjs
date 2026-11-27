'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const parser=require('@babel/parser'),traverse=require('@babel/traverse').default;
const {audit,resolveModule}=require('./audit-db-calls.cjs');
const root=path.resolve(__dirname,'..');
function propagate(sources){
  const files=Object.keys(sources),report=audit(files,{readSource:file=>sources[file]});
  const modules=new Map(),newAsync=new Set(),awaitCalls=new Set(),arrayCalls=new Map(),manual=[];
  for(const file of files){
    const ast=parser.parse(sources[file],{sourceType:'unambiguous',allowReturnOutsideFunction:true});
    const calls=[],imports=new Map(),exports=new Map();
    traverse(ast,{
      CallExpression(p){calls.push(p);},
      VariableDeclarator(p){const n=p.node;if(n.init?.type!=='CallExpression'||n.init.callee.name!=='require'||n.init.arguments[0]?.type!=='StringLiteral')return;
        const module=resolveModule(file,n.init.arguments[0].value);
        if(n.id.type==='ObjectPattern')for(const prop of n.id.properties)if(prop.type==='ObjectProperty'&&prop.value.type==='Identifier')imports.set(prop.value,{module,name:prop.key.name||prop.key.value,identifier:prop.value});
      },
      AssignmentExpression(p){const n=p.node;if(n.left.type==='MemberExpression'&&n.left.object.name==='module'&&n.left.property.name==='exports'&&n.right.type==='ObjectExpression')for(const prop of n.right.properties)if(prop.type==='ObjectProperty'&&prop.value.type==='Identifier')exports.set(prop.key.name||prop.key.value,p.scope.getBinding(prop.value.name));},
    });
    modules.set(file,{ast,calls,imports,exports});
  }
  const functionOfBinding=binding=>{
    const p=binding?.path;
    if(p?.isFunctionDeclaration())return p.node;
    if(p?.isVariableDeclarator()&&['ArrowFunctionExpression','FunctionExpression'].includes(p.node.init?.type))return p.node.init;
    return null;
  };
  function markOwner(call,file){
    const owner=call.getFunctionParent();
    if(!owner||call.node.start<owner.node.body.start||['constructor','get','set'].includes(owner.node.kind)){
      manual.push({file,line:call.node.loc.start.line,reason:'startup or constructor must be reviewed'});return false;
    }
    if(!owner.node.async){owner.node.async=true;newAsync.add(owner.node);return true;}return false;
  }
  for(const call of report.calls.filter(c=>!c.awaited)){
    const p=modules.get(call.file).calls.find(p=>p.node.start===call.start&&p.node.end===call.end);
    if(!p)continue;markOwner(p,call.file);if(p.getFunctionParent()?.node.async)awaitCalls.add(p.node);
  }
  function target(p,file){
    if(['FunctionExpression','ArrowFunctionExpression'].includes(p.node.type))return p.node;
    if(p.isIdentifier()){
      const local=functionOfBinding(p.scope.getBinding(p.node.name));if(local)return local;
      const imported=modules.get(file).imports.get(p.scope.getBinding(p.node.name)?.identifier);
      if(imported)return functionOfBinding(modules.get(imported.module)?.exports.get(imported.name));
    }
    return null;
  }
  let changed=true;
  while(changed){
    changed=false;
    const methods=new Set([...newAsync].filter(n=>n.type==='ClassMethod').map(n=>n.key.name));
    for(const [file,module]of modules)for(const call of module.calls){
      const node=call.node;
      let fn=target(call.get('callee'),file);
      const callee=node.callee;
      const method=callee.type==='MemberExpression'&&!callee.computed?callee.property.name:null;
      if(newAsync.has(fn)||(method&&methods.has(method))){
        if(!call.parentPath.isAwaitExpression()){
          if(markOwner(call,file))changed=true;
          if(call.getFunctionParent()?.node.async)awaitCalls.add(node);
        }
      }
      if(method&&['map','filter','forEach','some','every','find','findIndex','reduce','sort'].includes(method)&&node.arguments.length){
        fn=target(call.get('arguments.0'),file);
        if(newAsync.has(fn)&&!arrayCalls.has(node)){
          arrayCalls.set(node,{file,method});if(markOwner(call,file))changed=true;
        }
      }
    }
  }
  const output={},stats={functions:newAsync.size,awaits:awaitCalls.size,arrays:arrayCalls.size,manual:[...new Map(manual.map(m=>[m.file+':'+m.line,m])).values()]};
  for(const [file,module]of modules){
    const edits=[];
    traverse(module.ast,{Function(p){if(newAsync.has(p.node))edits.push({position:p.node.start,text:'async '});}});
    for(const call of module.calls){const node=call.node;
      if(arrayCalls.has(node)){
        const {method}=arrayCalls.get(node),object=node.callee.object;
        edits.push({position:node.start,text:'(await __asyncDbArray('+JSON.stringify(method)+', '},{position:object.end,end:node.arguments[0].start,text:', '},{position:node.end,text:')'});
      }else if(awaitCalls.has(node))edits.push({position:node.start,text:'(await '},{position:node.end,text:')'});
    }
    if([...arrayCalls.values()].some(v=>v.file===file)){
      let relative=path.relative(path.dirname(file),'src/utils/asyncArray').replaceAll('\\','/');if(!relative.startsWith('.'))relative='./'+relative;
      // Keep directive prologues intact.
      const position=module.ast.program.directives.at(-1)?.end||0;
      edits.push({position,text:'\nconst { asyncArray: __asyncDbArray } = require('+JSON.stringify(relative)+');\n'});
    }
    let text=sources[file];
    for(const edit of edits.sort((a,b)=>b.position-a.position))text=text.slice(0,edit.position)+edit.text+text.slice(edit.end??edit.position);
    parser.parse(text,{sourceType:'unambiguous',allowReturnOutsideFunction:true});output[file]=text;
  }
  return {output,stats};
}
module.exports={propagate};
if(require.main===module){
  const files=cp.execFileSync('git',['ls-files','*.js'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>!f.startsWith('src/')&&!f.startsWith('app/frontend/')&&!f.includes('tempCodeRunnerFile'));
  const sources=Object.fromEntries(files.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
  const {output,stats}=propagate(sources);
  if(process.argv.includes('--write'))for(const [file,text]of Object.entries(output))if(text!==sources[file])fs.writeFileSync(path.join(root,file),text);
  console.log(JSON.stringify({...stats,written:process.argv.includes('--write')}));
}
