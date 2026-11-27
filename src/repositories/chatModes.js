'use strict';
const {compatibleNumber}=require('./legacyReads');
function createChatModes(runtime){
  const get=async id=>{
    const row=await runtime.one('SELECT * FROM chats WHERE chat_id=?',[String(id)]);
    if(row){row.is_double_chat=compatibleNumber(row.is_double_chat);row.is_dice_chat=compatibleNumber(row.is_dice_chat);}return row;
  };
  const activate=async(id,mode)=>{await runtime.execute('INSERT INTO chats(chat_id,is_double_chat,is_dice_chat) VALUES (?,?,?) ON DUPLICATE KEY UPDATE is_double_chat=VALUES(is_double_chat),is_dice_chat=VALUES(is_dice_chat)',[String(id),mode==='double'?1:0,mode==='dice'?1:0]);return {success:true};};
  const deactivate=async(id,field)=>{const result=await runtime.execute('UPDATE chats SET '+field+'=0 WHERE chat_id=?',[String(id)]);return result.changes?{success:true}:{success:false,message:'Чат с указанным ID не найден.'};};
  return {
    getChatByChatId:get,
    activateDoubleMode:id=>activate(id,'double'),activateDiceMode:id=>activate(id,'dice'),
    deactivateDoubleMode:id=>deactivate(id,'is_double_chat'),deactivateDiceMode:id=>deactivate(id,'is_dice_chat'),
    async isDoubleChat(id){return (await get(id))?.is_double_chat===1;},
    async isDiceChat(id){return (await get(id))?.is_dice_chat===1;},
    async getActiveModeInChat(id){const row=await get(id);return row?.is_double_chat===1?'double':row?.is_dice_chat===1?'dice':null;},
    async addChat(id){await runtime.execute('INSERT IGNORE INTO chats(chat_id,is_double_chat) VALUES (?,0)',[String(id)]);},
    async getAllActiveDiceChats(){return (await runtime.many('SELECT chat_id FROM chats WHERE is_dice_chat=1')).map(row=>row.chat_id);},
  };
}
module.exports={createChatModes};
