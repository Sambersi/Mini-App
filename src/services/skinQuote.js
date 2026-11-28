'use strict';
const {randomBytes}=require('node:crypto');
function addSkinQuote(session,skin,{now=Date.now(),nonce=randomBytes(12).toString('hex')}={}){
  const quotes=session.skinPurchaseQuotes||{};
  const entries=Object.entries(quotes).filter(([,quote])=>now-quote.createdMs<=900000).slice(-19);
  session.skinPurchaseQuotes=Object.fromEntries(entries);
  session.skinPurchaseQuotes[nonce]={skinId:String(skin.id),price:String(skin.price).replace(/\.0+$/,''),currency:skin.currency_type,createdMs:now};
  return 'q'+nonce;
}
function getSkinQuote(session,token,{now=Date.now()}={}){
  if(!/^q[a-f0-9]{24}$/.test(token||''))return null;
  const quote=session?.skinPurchaseQuotes?.[token.slice(1)];
  return quote&&now>=quote.createdMs&&now-quote.createdMs<=900000?quote:null;
}
module.exports={addSkinQuote,getSkinQuote};
