'use strict';
const {compatibleNumber}=require('./legacyReads');
const FINANCE_LOG_CATEGORIES={finance:['transfer','donation','promo'],admin:['admin_give','admin_take','admin_set'],moderation:['ban','unban','mute','unmute','kick','block_transfers','unblock_transfers']};
const ITEM_CURRENCY_MAP={balance:'PF',card_balance:'PF_CARD',df_balance:'DF',npf_shares:'NPF',container_type_1:'CONTAINER_1',container_type_2:'CONTAINER_2',container_type_3:'CONTAINER_3',tickets:'TICKET',energy:'ENERGY',candy:'CANDY',secret_gifts:'GIFT'};
const PROMO_PRIZE_LABEL={balance:'PF',df_balance:'DF',npf_shares:'NPF',container_type_1:'CONTAINER_1',container_type_2:'CONTAINER_2',container_type_3:'CONTAINER_3',tickets:'TICKETS'};
function createFinanceLogs(runtime,{now=()=>Date.now(),cleanupOldMessageLogs}={}){
  const numeric=['id','ts','amount','success','actor_num','target_num'];
  const adapt=row=>{for(const key of numeric)if(Object.hasOwn(row,key))row[key]=compatibleNumber(row[key]);return row;};
  const limitValue=(value,name)=>{if(!Number.isSafeInteger(value)||value<0)throw new TypeError('Invalid '+name);return value;};
  const filters=({types,searchIds})=>{
    const where=["((f.action IS NOT NULL AND f.action != '') OR f.amount IS NOT NULL OR f.target_user_id IS NOT NULL OR f.actor_user_id IS NOT NULL)"],params=[];
    if(types?.length){where.push('f.type IN ('+types.map(()=>'?').join(',')+')');params.push(...types);}
    if(searchIds?.length){const slots=searchIds.map(()=>'?').join(',');where.push('(f.actor_user_id IN ('+slots+') OR f.target_user_id IN ('+slots+'))');params.push(...searchIds.map(String),...searchIds.map(String));}
    return {where:' WHERE '+where.join(' AND '),params};
  };
  const columns='f.id,f.ts,f.type,f.actor_user_id,f.target_user_id,f.amount,f.currency,f.ref,f.reason,f.action,f.payload,f.success,f.chat_id,f.chat_title,f.chat_type,a.display_name AS actor_name,a.numeric_id AS actor_num,t.display_name AS target_name,t.numeric_id AS target_num';
  const joins=' FROM finance_log f LEFT JOIN players a ON a.telegram_id=f.actor_user_id LEFT JOIN players t ON t.telegram_id=f.target_user_id';
  async function resolveUsername(id){return id?(await runtime.one('SELECT display_name FROM players WHERE telegram_id=?',[String(id)]))?.display_name||null:null;}
  async function logFinance(entry){
    if(!entry?.type||!entry.actorUserId)return {success:false,error:'type и actorUserId обязательны'};
    try{
      const payload=entry.payload==null?null:typeof entry.payload==='string'?entry.payload:JSON.stringify(entry.payload);
      const result=await runtime.execute('INSERT INTO finance_log(ts,type,actor_user_id,target_user_id,amount,currency,ref,chat_id,chat_title,chat_type,reason,action,payload,success) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[now(),entry.type,String(entry.actorUserId),entry.targetUserId?String(entry.targetUserId):null,entry.amount??null,entry.currency||null,entry.ref||null,entry.chatId?String(entry.chatId):null,entry.chatTitle||null,entry.chatType||null,entry.reason||null,entry.action||null,payload,entry.success===undefined?1:entry.success?1:0]);
      return {success:true,id:compatibleNumber(result.lastInsertRowid)};
    }catch(error){if(runtime.inTransaction?.())throw error;return {success:false,error:'FINANCE_LOG_WRITE_FAILED'};}
  }
async function logAdminItem({ adminId, targetUserId, direction, itemType, amount = null, comment = null, success = true, adminName = null, targetName = null }) {
  const currency = ITEM_CURRENCY_MAP[itemType] || String(itemType).toUpperCase();
  const aName = adminName || (await resolveUsername(adminId)) || `ID ${adminId}`;
  const tName = targetName || (await resolveUsername(targetUserId)) || `ID ${targetUserId}`;
  const qty = amount != null ? amount.toLocaleString('ru-RU') : '';
  let action;
  if (direction === 'give') {
    action = `${aName} выдал ${qty} ${currency} игроку ${tName}`;
  } else if (direction === 'take') {
    action = `${aName} забрал ${qty} ${currency} у игрока ${tName}`;
  } else {
    action = `${aName} установил баланс ${qty} ${currency} игроку ${tName}`;
  }
  if (comment) action += ` (${comment})`;
  return logFinance({
    type: direction === 'give' ? 'admin_give' : direction === 'take' ? 'admin_take' : 'admin_set',
    actorUserId: adminId,
    targetUserId,
    amount,
    currency,
    ref: itemType,
    action,
    payload: { comment },
    success,
  });
}
async function logModeration({ adminId, targetUserId, type, chatId = null, chatTitle = null, reason = null, durationHours = null, success = true, adminName = null, targetName = null }) {
  const aName = adminName || (await resolveUsername(adminId)) || `ID ${adminId}`;
  const tName = targetName || (await resolveUsername(targetUserId)) || `ID ${targetUserId}`;
  const reasonSuffix = reason && reason !== 'Не указана' ? `: ${reason}` : '';
  const durationSuffix = durationHours ? ` (${durationHours} ч)` : '';
  const chatSuffix = chatTitle ? ` в чате «${chatTitle}»` : '';
  const verbs = {
    ban: `${aName} забанил ${tName}${reasonSuffix}${durationSuffix}`,
    unban: `${aName} разбанил ${tName}`,
    mute: `${aName} замутил ${tName}${reasonSuffix}${durationSuffix}${chatSuffix}`,
    unmute: `${aName} размьютил ${tName}${chatSuffix}`,
    kick: `${aName} кикнул ${tName} из чата${reasonSuffix}${chatSuffix}`,
    block_transfers: `${aName} заблокировал переводы игроку ${tName}`,
    unblock_transfers: `${aName} разблокировал переводы игроку ${tName}`,
  };
  const action = verbs[type] || `${aName}: ${type} → ${tName}`;
  return logFinance({
    type,
    actorUserId: adminId,
    targetUserId,
    amount: null,
    currency: null,
    chatId,
    reason,
    action,
    payload: { durationHours },
    success,
  });
}
async function logPromoActivation({ userId, promoName, prizeType = null, prizeAmount = null, success = true, reason = null }) {
  const uName = (await resolveUsername(userId)) || `ID ${userId}`;
  const prizeLabel = PROMO_PRIZE_LABEL[prizeType] || String(prizeType || '').toUpperCase();
  const qty = prizeAmount != null ? Number(prizeAmount).toLocaleString('ru-RU') : '';
  let action;
  if (success) {
    action = `${uName} активировал(а) промокод «${promoName}» → начислено ${qty} ${prizeLabel}`;
  } else {
    action = `${uName} — отказ активации промокода «${promoName}»: ${reason || 'причина не указана'}`;
  }
  return logFinance({
    type: 'promo',
    actorUserId: userId,
    targetUserId: null,
    amount: success ? prizeAmount : null,
    currency: success ? prizeLabel : null,
    ref: promoName,
    action,
    payload: { reason, prizeType, prizeAmount },
    success,
  });
}
  async function getAdminLogsFinance({targetTs=null,types=null,searchIds=null,limit=50}={}){
    limitValue(limit,'limit');const {where,params}=filters({types,searchIds});
    return runtime.transaction(async()=>{
      let rows;
      if(targetTs){const half=Math.ceil(limit/2);const before=await runtime.many('SELECT '+columns+joins+where+' AND f.ts<=? ORDER BY f.ts DESC,f.id DESC LIMIT '+half,[...params,targetTs]);const after=await runtime.many('SELECT '+columns+joins+where+' AND f.ts>? ORDER BY f.ts ASC,f.id ASC LIMIT '+half,[...params,targetTs]);rows=[...before,...after].sort((a,b)=>Number(b.ts)-Number(a.ts));}
      else rows=await runtime.many('SELECT '+columns+joins+where+' ORDER BY f.ts DESC,f.id DESC LIMIT '+limit,params);
      return {rows:rows.map(adapt),total:rows.length,page:1,pages:1};
    });
  }
  async function getFinanceLogPage({targetTs=null,types=null,searchIds=null,limit=50,offset=0}={}){
    limitValue(limit,'limit');limitValue(offset,'offset');if(!limit)throw new TypeError('Invalid page limit');
    const {where,params}=filters({types,searchIds});
    return runtime.transaction(async()=>{
      const total=compatibleNumber((await runtime.one('SELECT COUNT(*) AS n FROM finance_log f'+where,params)).n);
      if(targetTs!=null){const newer=Number((await runtime.one('SELECT COUNT(*) AS n FROM finance_log f'+where+' AND f.ts>?',[...params,targetTs])).n);offset=Math.max(0,Math.min(Math.floor(newer/limit)*limit,Math.max(0,total-limit)));}
      const rows=await runtime.many('SELECT '+columns+joins+where+' ORDER BY f.ts DESC,f.id DESC LIMIT '+limit+' OFFSET '+offset,params);
      return {rows:rows.map(adapt),total,offset};
    });
  }
  async function resolveLogSearchIds(search){if(!search)return null;const value=String(search).trim();if(!value)return null;const ids=[value],numericId=parseInt(value,10)||-1;const found=await runtime.one('SELECT telegram_id FROM players WHERE numeric_id=?',[numericId]);if(found&&!ids.includes(found.telegram_id))ids.push(found.telegram_id);return ids;}
  async function removeOlder(table,column,days){if(typeof days!=='number'||!Number.isFinite(days)||days<0)throw new TypeError('Invalid retention');return (await runtime.execute('DELETE FROM '+table+' WHERE '+column+'<?',[now()-days*86400000])).changes;}
  async function cleanupFinanceLog(days=365){return {success:true,deletedCount:await removeOlder('finance_log','ts',days)};}
  async function cleanupDoubleRounds(days=3){return removeOlder('double_rounds','start_ts',days);}
  async function cleanupDoubleBetsLog(days=30){return removeOlder('double_bets_log','ts',days);}
  async function cleanupDiceLogs(days=90){await runtime.transaction(async()=>{await removeOlder('dice_bets_log','ts',days);await removeOlder('dice_rounds_log','start_ts',days);});}
  async function runLogsCleanup(){await cleanupOldMessageLogs(30);await cleanupFinanceLog(365);await cleanupDoubleRounds(90);await cleanupDoubleBetsLog(90);await cleanupDiceLogs(90);}
  return {logFinance,logAdminItem,logModeration,logPromoActivation,getAdminLogsFinance,getFinanceLogPage,resolveLogSearchIds,cleanupFinanceLog,cleanupDoubleRounds,cleanupDoubleBetsLog,cleanupDiceLogs,runLogsCleanup,FINANCE_LOG_CATEGORIES};
}
module.exports={createFinanceLogs,FINANCE_LOG_CATEGORIES};
