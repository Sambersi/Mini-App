'use strict';
const {compatibleNumber}=require('./legacyReads');
const numeric=new Set(['id','price','stock','max_stock','total_serials','glow_id','is_visible_in_shop','is_visible_in_case','base_damage','width','height','x_position','y_position','durability','current_durability','phase','start_time','phase1_hp','phase2_hp','phase1_max_hp','phase2_max_hp','correct_button_index','prize_amount']);
function catalogRow(row){if(!row)return row;for(const key of numeric)if(Object.hasOwn(row,key))row[key]=compatibleNumber(row[key]);return row;}
function createCatalogs(runtime){
  const one=async(sql,args=[])=>catalogRow(await runtime.one(sql,args));
  const many=async(sql,args=[])=> (await runtime.many(sql,args)).map(catalogRow);
  return {
    getAllPrefixes:()=>many('SELECT * FROM prefixes'),
    getPrefixById:id=>one('SELECT * FROM prefixes WHERE id=?',[id]),
    getAllSpecialPrefixes:()=>many('SELECT * FROM special_prefixes'),
    getSpecialPrefixById:id=>one('SELECT * FROM special_prefixes WHERE id=?',[id]),
    async createSpecialPrefix(prefix,createdBy){
      try{
        const result=await runtime.execute('INSERT INTO special_prefixes(prefix,created_by) VALUES (?,?)',[prefix,String(createdBy)]);
        return {success:true,message:`✅ Специальный префикс "${prefix}" успешно создан с ID ${result.lastInsertRowid}.`};
      }catch(error){
        return {success:false,message:error.code==='ER_DUP_ENTRY'?'❌ Префикс уже существует.':'❌ Произошла ошибка при создании префикса.'};
      }
    },
    async deleteSpecialPrefix(id){
      try{
        return await runtime.transaction(async()=>{
          if(!await runtime.one('SELECT id FROM special_prefixes WHERE id=? FOR UPDATE',[id]))return {success:false,message:'Префикс не найден.'};
          await runtime.execute('UPDATE player_prefix_ownership SET special_prefix_id=NULL WHERE special_prefix_id=?',[id]);
          await runtime.execute('DELETE FROM special_prefixes WHERE id=?',[id]);
          return {success:true,message:'Префикс успешно удален.'};
        });
      }catch{return {success:false,message:'Ошибка при удалении префикса.'};}
    },
    getSkinIdByName:async name=>(await one('SELECT id FROM skins WHERE name=?',[name]))?.id||null,
    getSkinRarity:async name=>(await one('SELECT rarity FROM skins WHERE file_name=?',[name]))?.rarity||'ORDINARY',
    getUserSkinsByNumericId:id=>many('SELECT s.id,s.name,s.rarity,s.file_name,us.serial_number FROM user_skins us JOIN skins s ON s.id=us.skin_id JOIN players p ON p.telegram_id=us.user_id WHERE p.numeric_id=?',[id]),
    getCardTemplateById:id=>one('SELECT file_name FROM skins WHERE id=?',[id]),
    getAllWeapons:()=>many('SELECT id,name,base_damage,price,price_type,width,height,x_position,y_position,durability FROM weapons'),
    getWeaponById:id=>one('SELECT * FROM weapons WHERE id=?',[id]),
    getWeaponByName:name=>one('SELECT * FROM weapons WHERE name=?',[name]),
    getCurrentBoss:()=>one('SELECT * FROM bosses ORDER BY id DESC LIMIT 1'),
    getUserSkinsWithSerials:id=>many('SELECT us.serial_number,s.* FROM user_skins us JOIN skins s ON s.id=us.skin_id WHERE us.user_id=?',[String(id)]),
    async updateSkinStock(id,stock){return (await runtime.execute('UPDATE skins SET stock=? WHERE id=?',[stock,id])).changes>0;},
    async updateSkinPrice(id,price){return (await runtime.execute('UPDATE skins SET price=? WHERE id=?',[price,id])).changes>0;},
    async updateBossState(id,hp,phase){return runtime.execute('UPDATE bosses SET '+(Number(phase)===1?'phase1_hp':'phase2_hp')+'=? WHERE id=?',[hp,id]);},
    async updateBossCorrectButtonIndex(id,index){await runtime.execute('UPDATE bosses SET correct_button_index=? WHERE id=?',[index,id]);},
    async resetBossDamage(){await runtime.execute('DELETE FROM boss_damage');},
  };
}
module.exports={createCatalogs,catalogRow};
