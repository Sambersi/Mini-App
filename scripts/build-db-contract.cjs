'use strict';
const fs=require('node:fs'),path=require('node:path'),parser=require('@babel/parser'),traverse=require('@babel/traverse').default;
const root=path.resolve(__dirname,'..'),functions=new Set(),constants=new Set(),definitions=new Set();
const ast=parser.parse(fs.readFileSync(path.join(root,'db.js'),'utf8'),{sourceType:'script'});
traverse(ast,{FunctionDeclaration(p){if(p.node.id)definitions.add(p.node.id.name);}});
traverse(ast,{AssignmentExpression(p){const n=p.node;if(n.left.type!=='MemberExpression'||n.left.object.name!=='module'||n.left.property.name!=='exports'||n.right.type!=='ObjectExpression')return;for(const property of n.right.properties){const name=property.key?.name;if(!name)continue;(definitions.has(property.value?.name)?functions:constants).add(name);}}});
const contract={functions:[...functions].sort(),constants:[...constants].sort()};
fs.writeFileSync(path.join(root,'src/db/legacyContract.json'),JSON.stringify(contract,null,2)+'\n');console.log(JSON.stringify({functions:functions.size,constants:constants.size}));
