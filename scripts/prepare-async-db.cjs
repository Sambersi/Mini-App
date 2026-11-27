'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const parser=require('@babel/parser');
const {audit}=require('./audit-db-calls.cjs');
function addAwaits(source,calls){
  const edits=calls.filter(c=>c.ownerAsync&&c.inBody&&!c.awaited).flatMap(c=>[{position:c.start,text:'(await '},{position:c.end,text:')'}]).sort((a,b)=>b.position-a.position);
  let result=source;
  for(const edit of edits)result=result.slice(0,edit.position)+edit.text+result.slice(edit.position);
  parser.parse(result,{sourceType:'unambiguous',allowReturnOutsideFunction:true});
  return result;
}
module.exports={addAwaits};
if(require.main===module){
  const root=path.resolve(__dirname,'..');
  const files=cp.execFileSync('git',['ls-files','*.js'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>!f.startsWith('src/')&&!f.startsWith('app/frontend/')&&!f.includes('tempCodeRunnerFile'));
  const report=audit(files),byFile=new Map();
  for(const call of report.calls.filter(c=>c.ownerAsync&&c.inBody&&!c.awaited)){
    if(!byFile.has(call.file))byFile.set(call.file,[]);byFile.get(call.file).push(call);
  }
  for(const [file,calls]of byFile){const full=path.join(root,file),source=fs.readFileSync(full,'utf8');const result=addAwaits(source,calls);if(process.argv.includes('--write'))fs.writeFileSync(full,result);}
  console.log(JSON.stringify({files:byFile.size,awaits:[...byFile.values()].reduce((n,c)=>n+c.length,0),written:process.argv.includes('--write')}));
}
