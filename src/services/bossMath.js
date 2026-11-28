'use strict';
function makeBossQuestion(phase,random=Math.random){
  let a=Math.floor(random()*15)+1,b=Math.floor(random()*15)+1;const op=random()<0.5?'+':'-';if(op==='-'&&a<b)[a,b]=[b,a];
  const correctResult=op==='+'?a+b:a-b,answers=[correctResult],count=phase===1?4:8;
  while(answers.length<count){const value=Math.floor(random()*(Math.abs(correctResult)+15))+1;if(!answers.includes(value))answers.push(value);}
  for(let i=answers.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[answers[i],answers[j]]=[answers[j],answers[i]];}
  return {answers,correctResult,example:`${a} ${op} ${b}`};
}
function bossDamage({name,baseDamage,attackPower,streak,correct}){
  if(!correct)return {damage:0n,streak:0,combo:false,reduced:false};
  let damage=BigInt(baseDamage)*(name==='Кулак'?(BigInt(attackPower||1)||1n):1n);if(damage<0n)throw new Error('Invalid boss damage');
  const reduced=!['Кулак','Ручка','Бумажка','Указка'].includes(name);if(reduced)damage/=10n;
  streak++;const combo=streak>=5;if(combo){damage*=2n;streak=0;}
  return {damage,streak,combo,reduced};
}
module.exports={makeBossQuestion,bossDamage};
