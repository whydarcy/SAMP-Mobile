export function createPushToTalk(send,changed=()=>{},schedule=setInterval,cancel=clearInterval){
 let held=false,timer=null,generation=0;
 function transmit(value){try{return Promise.resolve(send(value));}catch(error){return Promise.reject(error);}}
 function stop(){const wasHeld=held;held=false;generation++;if(timer!==null){cancel(timer);timer=null;}changed(false);if(wasHeld)transmit(false).catch(()=>{});}
 function start(){if(held)return;held=true;const token=++generation;changed(true);transmit(true).catch(()=>{if(generation===token)stop();});timer=schedule(()=>{if(held)transmit(true).catch(stop);},1000);}
 return {start,stop,isHeld:()=>held};
}
