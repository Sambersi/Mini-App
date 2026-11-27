'use strict';
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
const {createHmac,timingSafeEqual}=require('node:crypto');
function unauthorized(){throw Object.assign(new Error('Unauthorized'),{code:'TELEGRAM_AUTH_INVALID'});}
function validateInitData(raw,{botToken,now=()=>Date.now(),maxAgeSeconds=86400,futureSkewSeconds=30}={}){
  if(typeof botToken!=='string'||!botToken)throw new Error('BOT_TOKEN_REQUIRED');
  if(typeof raw!=='string'||!raw||raw.length>16384)unauthorized();
  const params=new URLSearchParams(raw),seen=new Set();
  for(const [key]of params){if(seen.has(key))unauthorized();seen.add(key);}
  const received=params.get('hash');if(!received||!/^\w{64}$/.test(received)||!/^[a-fA-F0-9]+$/.test(received))unauthorized();
  params.delete('hash');
  const chain=[...params].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>key+'='+value).join('\n');
  const secret=createHmac('sha256','WebAppData').update(botToken).digest();
  const expected=createHmac('sha256',secret).update(chain).digest();
  if(!timingSafeEqual(expected,Buffer.from(received,'hex')))unauthorized();
  const authDate=Number(params.get('auth_date')),seconds=Math.floor(now()/1000);
  if(!Number.isSafeInteger(authDate)||authDate<=0||authDate>seconds+futureSkewSeconds||seconds-authDate>maxAgeSeconds)unauthorized();
  let user;try{user=JSON.parse(params.get('user'));}catch{unauthorized();}
  if(!user||!Number.isSafeInteger(user.id)||user.id<=0)unauthorized();
  return {userId:String(user.id),user,authDate};
}
function telegramAuth(options){
  if(!options?.botToken)throw new Error('BOT_TOKEN_REQUIRED');
  return (req,res,next)=>{
    const header=req.get('authorization');
    if(typeof header!=='string'||!header.startsWith('tma '))return res.status(401).json({error:'UNAUTHORIZED'});
    try{req.auth=validateInitData(header.slice(4),options);}catch{return res.status(401).json({error:'UNAUTHORIZED'});}
    return next();
  };
}
function ownPlayer(parameter='userId'){
  return(req,res,next)=>{
    if(!req.auth)return res.status(401).json({error:'UNAUTHORIZED'});
    if(String(req.params[parameter])!==req.auth.userId)return res.status(403).json({error:'FORBIDDEN'});
    return next();
  };
}
function adminOnly(isAdmin){return async(req,res,next)=>{
  if(!req.auth)return res.status(401).json({error:'UNAUTHORIZED'});
  try{if(!await isAdmin(req.auth.userId))return res.status(403).json({error:'FORBIDDEN'});}catch{return res.status(503).json({error:'AUTHORIZATION_UNAVAILABLE'});}
  return next();
};}
module.exports={validateInitData,telegramAuth,ownPlayer,adminOnly};
