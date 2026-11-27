'use strict';
// Preserve the old sequential callback order while awaiting database work.
async function asyncArray(method, source, callback, ...args) {
  if(method==='forEach'&&(source instanceof Map||source instanceof Set)){
    for(const [key,value]of source.entries())await callback(value,key,source);
    return;
  }
  if(!Array.isArray(source))throw new TypeError('Expected an array');
  if(method==='sort'){
    const sorted=source.slice();
    for(let width=1;width<sorted.length;width*=2){
      const input=sorted.slice();
      for(let start=0;start<sorted.length;start+=2*width){
        let left=start,right=Math.min(start+width,sorted.length),out=start;
        const middle=right,end=Math.min(start+2*width,sorted.length);
        while(left<middle&&right<end)sorted[out++]=(await callback(input[left],input[right]))<=0?input[left++]:input[right++];
        while(left<middle)sorted[out++]=input[left++];while(right<end)sorted[out++]=input[right++];
      }
    }
    source.splice(0,source.length,...sorted);return source;
  }
  const result=method==='map'?new Array(source.length):[];
  let accumulator=args[0],hasAccumulator=args.length>0;
  for(let index=0;index<source.length;index++){
    if(!(index in source)&&!['find','findIndex'].includes(method))continue;
    const value=source[index];
    if(method==='reduce'){
      if(!hasAccumulator){accumulator=value;hasAccumulator=true;}
      else accumulator=await callback(accumulator,value,index,source);
      continue;
    }
    const returned=await callback.call(args[0],value,index,source);
    if(method==='map')result[index]=returned;
    if(method==='filter'&&returned)result.push(value);
    if(method==='some'&&returned)return true;
    if(method==='every'&&!returned)return false;
    if(method==='find'&&returned)return value;
    if(method==='findIndex'&&returned)return index;
  }
  if(method==='reduce'){if(!hasAccumulator)throw new TypeError('Reduce of empty array');return accumulator;}
  if(method==='some')return false;if(method==='every')return true;if(method==='find')return undefined;if(method==='findIndex')return -1;
  if(method==='forEach')return;
  if(!['map','filter'].includes(method))throw new TypeError('Unsupported async array operation');
  return result;
}
module.exports={asyncArray};
