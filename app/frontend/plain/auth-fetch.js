(function installTelegramAuthentication(){
  'use strict';
  const originalFetch=window.fetch.bind(window);
  window.fetch=function telegramFetch(input,options={}){
    const raw=input instanceof Request?input.url:String(input);
    const url=new URL(raw,window.location.href);
    if(url.origin!==window.location.origin||!url.pathname.startsWith('/api/'))return originalFetch(input,options);
    const initData=window.Telegram?.WebApp?.initData;
    if(!initData)return originalFetch(input,options);
    const headers=new Headers(input instanceof Request?input.headers:undefined);
    new Headers(options.headers).forEach((value,key)=>headers.set(key,value));
    headers.set('Authorization','tma '+initData);
    return originalFetch(input,{...options,headers});
  };
})();
