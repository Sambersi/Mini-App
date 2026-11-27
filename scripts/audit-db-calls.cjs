'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const parser=require('@babel/parser'),traverse=require('@babel/traverse').default;
const root=path.resolve(__dirname,'..');
const normalize=p=>p.replaceAll('\\','/');
const dbFiles=new Set(['db.js','empire/db.js','sessions/registrationSession.js','sessions/skinShopSession.js']);
function resolveModule(file,value){
  if(!value.startsWith('.'))return value;
  const base=path.resolve(root,path.dirname(file),value);
  for(const name of [base,base+'.js',path.join(base,'index.js')])if(fs.existsSync(name)&&fs.statSync(name).isFile())return normalize(path.relative(root,name));
  return normalize(path.relative(root,path.extname(base)?base:base+'.js'));
}
function audit(files,{readSource=file=>fs.readFileSync(path.join(root,file),'utf8')}={}){
  const modules=new Map(),calls=[];
  for(const file of files){
    const code=readSource(file);
    const ast=parser.parse(code,{sourceType:'unambiguous',allowReturnOutsideFunction:true});
    const imports=new Map(),exports=new Set(),definitions=new Map();
    traverse(ast,{
      VariableDeclarator(p){const n=p.node;if(n.init?.type!=='CallExpression'||n.init.callee.name!=='require'||n.init.arguments[0]?.type!=='StringLiteral')return;
        const module=resolveModule(file,n.init.arguments[0].value);
        if(n.id.type==='ObjectPattern'){
          for(const prop of n.id.properties)if(prop.type==='ObjectProperty')imports.set(prop.value.name,{module,name:prop.key.name||prop.key.value,identifier:prop.value});
        } else if(n.id.type==='Identifier')imports.set(n.id.name,{module,name:'*',identifier:n.id});
      },
      FunctionDeclaration(p){if(p.node.id)definitions.set(p.node.id.name,{line:p.node.loc.start.line,async:p.node.async});},
      AssignmentExpression(p){const n=p.node;if(n.left.type==='MemberExpression'&&n.left.object.name==='module'&&n.left.property.name==='exports'&&n.right.type==='ObjectExpression')for(const prop of n.right.properties)if(prop.type==='ObjectProperty')exports.add(prop.key.name||prop.key.value);},
    });
    traverse(ast,{CallExpression(p){const n=p.node;let imported;
      if(n.callee.type==='Identifier'){
        const binding=imports.get(n.callee.name);
        if(binding&&p.scope.getBinding(n.callee.name)?.identifier===binding.identifier)imported=binding;
      }
      if(n.callee.type==='MemberExpression'&&n.callee.object.type==='Identifier'){
        const mod=imports.get(n.callee.object.name);if(mod?.name==='*'&&p.scope.getBinding(n.callee.object.name)?.identifier===mod.identifier)imported={module:mod.module,name:n.callee.property.name};
      }
      if(!imported||!dbFiles.has(imported.module))return;
      const owner=p.getFunctionParent();
      const ownerName=owner?.node.id?.name||owner?.parentPath.node.id?.name||'<callback>';
      calls.push({file,line:n.loc.start.line,start:n.start,end:n.end,inBody:!!owner&&n.start>=owner.node.body.start,owner:ownerName,ownerAsync:!!owner?.node.async,module:imported.module,name:imported.name,awaited:p.parentPath.isAwaitExpression(),context:p.parentPath.node.type});
    }});
    modules.set(file,{imports,exports,definitions});
  }
  const missing=calls.filter(c=>modules.has(c.module)&&!modules.get(c.module).exports.has(c.name));
  return {summary:{modules:modules.size,calls:calls.length,unawaited:calls.filter(c=>!c.awaited).length,missingExports:[...new Set(missing.map(c=>c.module+':'+c.name))]},calls,missing};
}
module.exports={audit,resolveModule};
if(require.main===module){
  const files=cp.execFileSync('git',['ls-files','*.js'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>!f.startsWith('src/')&&!f.startsWith('app/frontend/')&&!f.includes('tempCodeRunnerFile'));
  const report=audit(files);
  const output=process.argv[2]||'temp/db-call-audit.json';fs.mkdirSync(path.dirname(path.join(root,output)),{recursive:true});fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));
}
