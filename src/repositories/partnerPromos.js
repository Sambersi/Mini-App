'use strict';
const {compatibleNumber}=require('./legacyReads');
function transliterate(text) {
  const map = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  return text.toLowerCase().split('').map(char => map[char] || char).join('')
    .replace(/[^a-z0-9_-]/g, '').toUpperCase();
}

function createPartnerPromos(runtime,{now=()=>Date.now()}={}){
  const numeric=new Set(['id','prize_amount','admin_message_id','created_at','activations_left','min_status_id','expires_at','activated_at']);
  const adapt=row=>{if(row)for(const key of numeric)if(Object.hasOwn(row,key))row[key]=compatibleNumber(row[key]);return row;};
  const many=async(sql,args=[])=>(await runtime.many(sql,args)).map(adapt);
  const reserveAlias=(alias,name)=>runtime.transaction(async()=>{
    await runtime.execute('INSERT INTO promo_link_aliases(alias,promo_name,created_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE alias=VALUES(alias)',[alias,name,Math.floor(now()/1000)]);
    const owner=await runtime.one('SELECT promo_name FROM promo_link_aliases WHERE alias=? FOR UPDATE',[alias]);
    return owner.promo_name===name;
  });
  const api={
    async createPartnerRequest(partner,name,type,amount,audience,template){return (await runtime.execute('INSERT INTO partner_requests(partner_id,name,prize_type,prize_amount,audience_type,template,created_at) VALUES (?,?,?,?,?,?,?)',[String(partner),name,type,amount,audience,template||'normal',Math.floor(now()/1000)])).lastInsertRowid;},
    async createPartnerCurrencyRequest(partner,name,currency,amount){return (await runtime.execute('INSERT INTO partner_requests(partner_id,name,prize_type,prize_amount,audience_type,template,request_type,created_at) VALUES (?,?,?,?,?,?,?,?)',[String(partner),name,currency,amount,'all','normal','currency',Math.floor(now()/1000)])).lastInsertRowid;},
    async getPartnerRequestById(id){return adapt(await runtime.one('SELECT * FROM partner_requests WHERE id=?',[id]));},
    async getPartnerRequestByPartnerAndName(partner,name,status){return adapt(await runtime.one('SELECT * FROM partner_requests WHERE partner_id=? AND name=? AND status=? ORDER BY id LIMIT 1',[String(partner),name,status]));},
    getPartnerRequestsByPartner:partner=>many('SELECT * FROM partner_requests WHERE partner_id=? ORDER BY created_at DESC,id LIMIT 10',[String(partner)]),
    getPendingPartnerRequests:()=>many("SELECT * FROM partner_requests WHERE status='pending' ORDER BY created_at,id"),
    async getFinishedPartnerRequests(limit=20){if(!Number.isSafeInteger(limit)||limit<0)throw new TypeError('Invalid request limit');return many("SELECT * FROM partner_requests WHERE status<>'pending' ORDER BY created_at DESC,id LIMIT "+limit);},
    async getPartnerRequestsStats(partner,hours=24){
      const row=await runtime.one("SELECT COUNT(*) AS total,SUM(status='approved') AS approved,SUM(status='pending') AS pending,SUM(status='rejected') AS rejected,SUM(CASE WHEN status='approved' AND prize_type='balance' THEN prize_amount ELSE 0 END) AS sum_pf,SUM(CASE WHEN status='approved' AND prize_type='df_balance' THEN prize_amount ELSE 0 END) AS sum_df FROM partner_requests WHERE partner_id=? AND created_at>=?",[String(partner),Math.floor(now()/1000)-hours*3600]);
      return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,compatibleNumber(value)||0]));
    },
    async updatePartnerRequestStatus(id,status){await runtime.execute('UPDATE partner_requests SET status=? WHERE id=?',[status,id]);},
    async updatePartnerRequestAdminMessageId(id,message){await runtime.execute('UPDATE partner_requests SET admin_message_id=? WHERE id=?',[message,id]);},
    async createPromo(name,count,type,amount,creator,minStatus,expiry=null){return create(name,count,type,amount,creator,minStatus,expiry);},
    async createPartnerPromo(name,count,type,amount,creator,minStatus,expiry,partner,audience,template){return create(name,count,type,amount,creator,minStatus,expiry,partner,audience,template);},
    async getPromoById(id){return adapt(await runtime.one('SELECT * FROM promos WHERE id=?',[id]));},
    async getPromoByName(name){return adapt(await runtime.one('SELECT * FROM promos WHERE name=?',[name]));},
    getAllPromos:()=>many('SELECT * FROM promos ORDER BY id'),
    getExpiredPromos:()=>many('SELECT id,name FROM promos WHERE expires_at IS NOT NULL AND expires_at<? AND activations_left=-1 ORDER BY id',[Math.floor(now()/1000)]),
    async deletePromoById(id){return runtime.transaction(async()=>{
      await runtime.one('SELECT id FROM promos WHERE id=? FOR UPDATE',[id]);
      await runtime.execute('DELETE FROM promo_activations WHERE promo_id=?',[id]);
      const deleted=await runtime.execute('DELETE FROM promos WHERE id=?',[id]);return deleted.changes?{success:true}:{success:false,message:'Промокод с указанным ID не найден.'};
    });},
    async hasUserActivatedPromo(id,player){return !!await runtime.one('SELECT id FROM promo_activations WHERE promo_id=? AND user_id=? LIMIT 1',[id,String(player)]);},
    async recordPromoActivation(id,player){await runtime.transaction(async()=>{
      await runtime.one('SELECT id FROM promos WHERE id=? FOR UPDATE',[id]);
      if(!await api.hasUserActivatedPromo(id,player))await runtime.execute('INSERT INTO promo_activations(promo_id,user_id,activated_at) VALUES (?,?,?)',[id,String(player),Math.floor(now()/1000)]);
    });},
    transliterate,
    async savePromoAlias(alias,name){
      await runtime.execute('INSERT INTO promo_link_aliases(alias,promo_name,created_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE promo_name=VALUES(promo_name),created_at=VALUES(created_at)',[alias,name,Math.floor(now()/1000)]);
      return {success:true,alias};
    },
    async generatePromoAlias(name){
      const base=transliterate(name);
      if(!base)return null;
      for(let index=1;index<=100;index++){
        const candidate=index===1?base:`${base}_${index}`;
        if(await reserveAlias(candidate,name))return candidate;
      }
      const fallback=`${base}_${now()}`;
      return await reserveAlias(fallback,name)?fallback:null;
    },
    async getPromoNameByAlias(alias){return (await runtime.one('SELECT promo_name FROM promo_link_aliases WHERE alias=?',[alias.toUpperCase()]))?.promo_name||null;},
    async deletePromoAlias(name){await runtime.execute('DELETE FROM promo_link_aliases WHERE promo_name=?',[name]);},
    async cleanupExpiredPromos(){let count=0;for(const promo of await api.getExpiredPromos())if((await api.deletePromoById(promo.id)).success)count++;return count;},
  };
  async function create(name,count,type,amount,creator,minStatus,expiry,partner=null,audience='all',template='normal'){
    try{await runtime.execute('INSERT INTO promos(name,activations_left,prize_type,prize_amount,created_by,min_status_id,expires_at,creator_id,audience_type,template) VALUES (?,?,?,?,?,?,?,?,?,?)',[name,count,type,amount,String(creator),minStatus,expiry,partner===null?null:String(partner),audience,template]);return {success:true};}
    catch(error){if(error.code==='ER_DUP_ENTRY')return {success:false,message:'Промокод с таким названием уже существует.'};throw error;}
  }
  return api;
}
module.exports={createPartnerPromos};
