'use strict';
function createStartupTasks(){
  const tasks=[];let ready=false,running;
  return {
    add(label,work){if(ready)throw new Error('Startup already completed');tasks.push({label,work});},
    run(){
      if(!running)running=(async()=>{for(let i=0;i<tasks.length;i++)await tasks[i].work();ready=true;})();
      return running;
    },
  };
}
const startupTasks=createStartupTasks();
function runBackground(label,work){return Promise.resolve().then(work).catch(error=>console.error('[BACKGROUND]',label,error.code||error.name));}
module.exports={startupTasks,createStartupTasks,runBackground};
