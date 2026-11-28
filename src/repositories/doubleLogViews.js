'use strict';

const {compatibleNumber}=require('./legacyReads');
const {numericIdentifier}=require('./players');

const numeric=['id','ts','start_ts','end_ts','round_start_ts','round_end_ts','amount','is_win','win_amount','total_bank','bets_count','chats_count','participants_count','user_num','bets','bank','won'];
function adapt(row){
  for(const field of numeric)if(Object.hasOwn(row,field))row[field]=compatibleNumber(row[field]);
  return row;
}
const slots=values=>values.map(()=>'?').join(',');
const paging=(limit,offset=0)=>{
  if(!Number.isSafeInteger(limit)||limit<0||!Number.isSafeInteger(offset)||offset<0)throw new TypeError('Invalid pagination');
};
const cleanHash=value=>String(value??'').replace(/[%_]/g,'');
const roundSort=(a,b)=>Number(b.start_ts)-Number(a.start_ts);

function createDoubleLogViews(runtime){
  const many=async(sql,params)=>(await runtime.many(sql,params)).map(adapt);
  async function getAdminDoubleRoundsView({targetTs=null,hash=null,limit=50}={}){
    paging(limit);
    const safe=cleanHash(hash);
    const predicate=safe?'round_id LIKE ?':'1=1',params=safe?['%'+safe+'%']:[];
    const read=(condition,order,pageSize,args)=>many(
      'SELECT * FROM double_rounds WHERE '+predicate+condition+' ORDER BY start_ts '+order+',round_id LIMIT '+pageSize,
      args);
    const half=Math.ceil(limit/2);
    const rows=targetTs
      ?[...await read(' AND start_ts<=?','DESC',half,[...params,targetTs]),...await read(' AND start_ts>?','ASC',half,[...params,targetTs])].sort(roundSort)
      :await read('','DESC',limit,params);
    return {rows,total:rows.length};
  }

  async function getAdminDoubleBetsView({targetTs=null,searchIds=null,hash=null,limit=30,offset=0}={}){
    paging(limit,offset);
    const search=[],params=[];
    if(searchIds?.length){
      search.push('b.user_id IN ('+slots(searchIds)+')');
      params.push(...searchIds.map(String));
      const ids=searchIds.map(numericIdentifier).filter(id=>id!==null);
      if(ids.length){search.push('p.numeric_id IN ('+slots(ids)+')');params.push(...ids);}
    }
    const safe=cleanHash(hash);
    if(/^[0-9a-f]{8,}$/i.test(safe)){search.push('r.round_id LIKE ?');params.push('%'+safe+'%');}
    const filter=search.length?' AND ('+search.join(' OR ')+')':'';
    const from=' FROM double_bets_log b JOIN double_rounds r ON r.round_id=b.round_id LEFT JOIN players p ON p.telegram_id=b.user_id WHERE 1=1'+filter;
    const group=' GROUP BY b.round_id,b.user_id,b.chat_id,p.display_name,p.numeric_id,r.start_ts,r.end_ts,r.result_multiplier,r.salt,r.status';
    const select='SELECT b.round_id,b.user_id,b.chat_id,MIN(b.ts) AS ts,p.display_name AS user_name,p.numeric_id AS user_num,r.start_ts AS round_start_ts,r.end_ts AS round_end_ts,r.result_multiplier,r.salt,r.status AS round_status,MAX(b.chat_title) AS chat_title';
    const page=(extra,order,size,skip,args)=>many(select+from+extra+group+
      ' ORDER BY ts '+order+',b.round_id,b.user_id,b.chat_id LIMIT '+size+' OFFSET '+skip,args);
    return runtime.transaction(async()=>{
      const window=typeof targetTs==='number'&&Number.isFinite(targetTs);
      const half=Math.max(1,Math.ceil(limit/2));
      const rows=window
        ?[...(await page(' AND r.start_ts>?','ASC',half,0,[...params,targetTs])).reverse(),...await page(' AND r.start_ts<=?','DESC',half,0,[...params,targetTs])]
        :await page('','DESC',limit,offset,params);
      for(const row of rows){
        row.bets=await many('SELECT multiplier,amount,is_win,win_amount,game_choice,payout_status FROM double_bets_log WHERE round_id=? AND user_id=? AND chat_id <=> ? ORDER BY ts,id',
          [row.round_id,row.user_id,row.chat_id]);
      }
      const total=window?rows.length:Number((await runtime.one('SELECT COUNT(*) AS c FROM (SELECT 1'+from+group+') grouped',params)).c);
      return {rows,total,window};
    });
  }

  async function getDoubleRoundDetails(id){
    return runtime.transaction(async()=>{
      const round=await runtime.one('SELECT * FROM double_rounds WHERE round_id=?',[id]);
      if(!round)return {success:false,error:'Раунд не найден'};
      const accepted=" FROM double_bets_log b WHERE b.round_id=? AND b.status='accepted'";
      const bets=await many("SELECT b.id,b.ts,b.user_id,b.username,b.chat_id,b.chat_title,b.multiplier,b.amount,b.game_choice,b.is_win,b.win_amount,b.payout_status,p.numeric_id AS user_num FROM double_bets_log b LEFT JOIN players p ON p.telegram_id=b.user_id WHERE b.round_id=? AND b.status='accepted' ORDER BY b.ts,b.id",[id]);
      const firstUser=new Map(),firstChat=new Map();
      for(const bet of bets){
        if(!firstUser.has(bet.user_id))firstUser.set(bet.user_id,bet);
        if(!firstChat.has(bet.chat_id))firstChat.set(bet.chat_id,bet);
      }
      const participants=await many('SELECT b.user_id,COUNT(*) AS bets,SUM(b.amount) AS bank,SUM(CASE WHEN b.is_win=1 THEN COALESCE(b.win_amount,0) ELSE 0 END) AS won'+accepted+' GROUP BY b.user_id ORDER BY MIN(b.ts),MIN(b.id)',[id]);
      const chats=await many('SELECT b.chat_id,COUNT(*) AS bets,SUM(b.amount) AS bank'+accepted+' GROUP BY b.chat_id ORDER BY MIN(b.ts),MIN(b.id)',[id]);
      for(const participant of participants){
        const bet=firstUser.get(participant.user_id);
        Object.assign(participant,{username:bet.username,user_num:bet.user_num});
      }
      for(const chat of chats)chat.chat_title=firstChat.get(chat.chat_id).chat_title;
      return {success:true,round:adapt(round),participants,chats,bets};
    });
  }

  async function getAdminLogsDouble({sinceTs=0,searchIds=null,limit=30,offset=0}={}){
    paging(limit,offset);
    const ids=searchIds?.map(String)||[];
    const filter=ids.length?' AND b.user_id IN ('+slots(ids)+')':'';
    return runtime.transaction(async()=>{
      const size=limit+offset;
      const bets=await many('SELECT b.*,p.numeric_id AS user_num FROM double_bets_log b LEFT JOIN players p ON p.telegram_id=b.user_id WHERE b.ts>=?'+filter+' ORDER BY b.ts DESC,b.id DESC LIMIT '+size,[sinceTs,...ids]);
      const rounds=ids.length?[]:await many('SELECT * FROM double_rounds WHERE start_ts>=? ORDER BY start_ts DESC,round_id LIMIT '+size,[sinceTs]);
      const rows=bets.map(bet=>({
        id:bet.id,ts:bet.ts,userId:bet.user_id,userName:bet.username||'Неизвестный',userNum:bet.user_num,
        targetId:String(bet.round_id).slice(0,8),targetName:null,
        action:bet.status==='rejected'
          ?`Ставка отклонена: ${bet.reject_reason||'причина не указана'} (${bet.amount} PF, ${bet.multiplier})`
          :`Ставка ${bet.amount} PF на ${bet.multiplier}${bet.game_choice?' ('+bet.game_choice+')':''} → ${bet.is_win===1?'выигрыш '+bet.win_amount:bet.is_win===0?'проигрыш':'в игре'}`,
      }));
      for(const round of rounds)rows.push({
        id:'r'+round.round_id,ts:round.start_ts,userId:null,userNum:null,targetName:null,
        userName:round.status==='active'?' РАУНД ИДЕТ':'РАУНД',targetId:String(round.round_id).slice(0,8),
        action:round.status==='active'
          ?`Идет игра... Банк: ${round.total_bank||0}, ставок: ${round.bets_count||0}`
          :`Итог: ${round.result_multiplier||'—'}, банк ${round.total_bank||0}, ставок ${round.bets_count||0}`,
      });
      const betCount=await runtime.one('SELECT COUNT(*) AS n FROM double_bets_log b WHERE b.ts>=?'+filter,[sinceTs,...ids]);
      const roundCount=ids.length?0:(await runtime.one('SELECT COUNT(*) AS n FROM double_rounds WHERE start_ts>=?',[sinceTs])).n;
      return {rows:rows.sort((a,b)=>Number(b.ts)-Number(a.ts)).slice(offset,offset+limit),total:Number(betCount.n)+Number(roundCount)};
    });
  }
  return {getAdminDoubleRoundsView,getAdminDoubleBetsView,getDoubleRoundDetails,getAdminLogsDouble};
}

module.exports={createDoubleLogViews};
