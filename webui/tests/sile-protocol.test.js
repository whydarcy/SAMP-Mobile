import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUiCommands,executeUiOperations} from '../src/sile-protocol.js';
test('accepts actual auth errors, registration stages, sounds and batched HUD updates',()=>{
 const ops=parseUiCommands(`confirmBrowserInitialize(); interface('Authorization').$refs.auth.setError("password", "Неверный пароль"); interface('Authorization').setRegistrationStage(2); playSound('sounds/train/stop.mp3',0,1); interface('Hud').info.money = -500;`);
 assert.equal(ops.length,5);assert.deepEqual(ops[1],{kind:'call',interface:'Authorization',path:['$refs','auth'],name:'setError',args:['password','Неверный пароль']});assert.equal(ops[4].value,-500);
});
test('parses nested literal data, escaped strings and literal JSON without executing code',()=>{
 const [op]=parseUiCommands(`interface('Menu').setData({items:[1,true,null,undefined], title:'a\\\'b', value:JSON.parse('{"n":2}')});`);
 assert.equal(op.args[0].title,"a'b");assert.deepEqual(op.args[0].items,[1,true,null,undefined]);assert.deepEqual(op.args[0].value,{n:2});
});
test('rejects arbitrary execution, prototype access, DOM, loops and non-UI native APIs',()=>{
 for(const source of [`eval('bad')`,`Function('bad')()`,`fetch('https://x')`,`window.client.postMessage('bad')`,`client.postMessage('bad')`,`interface('Hud').constructor('bad')`,`interface('Hud')['__proto__'].x=1`,`interface('Hud').setData(JSON.parse('{"__proto__":{}}'))`,`interface('Hud').setData({get x(){return 1}})`,`interface('Hud').setData(()=>1)`,`while(true){}`,`document.body.innerHTML='bad'`,`interface('Hud').$el.remove()`,`interface('Hud').onBuy()`])assert.throws(()=>parseUiCommands(source),source);
});
test('executes operations in order and preserves component ref receiver',async()=>{
 const calls=[],auth={setError(...args){calls.push([this===auth,...args]);}},hud={info:{money:0}};
 await executeUiOperations(parseUiCommands(`openInterface('Authorization','["auth","Test"]');interface('Authorization').$refs.auth.setError('password','Test error');interface('Hud').info.money=42;`),{globals:{async openInterface(...args){calls.push(args);}},interface:async name=>name==='Authorization'?{$refs:{auth}}:hud});
 assert.deepEqual(calls,[['Authorization','["auth","Test"]'],[true,'password','Test error']]);assert.equal(hud.info.money,42);
});
test('stale session aborts queued operations and unavailable methods fail visibly',async()=>{
 let calls=0;await executeUiOperations(parseUiCommands(`hideInterface('Hud')`),{active:()=>false,globals:{hideInterface(){calls++;}}});assert.equal(calls,0);
 await assert.rejects(()=>executeUiOperations(parseUiCommands(`interface('Authorization').setError('x')`),{globals:{},interface:async()=>({})}),/Unavailable UI method/);
});

test('supports guarded cached interfaces and only explicit public constants',async()=>{
 const calls=[],api={globals:{},exists:name=>name==='Hud',constants:{gm:{EVENT_EXECUTE_PUBLIC:0},window:{KEY_CODE_I:73}},interface:async()=>({setValue(...args){calls.push(args);}})};
 await executeUiOperations(parseUiCommands("window.interface('Hud') && window.interface('Hud').setValue(window.KEY_CODE_I,gm.EVENT_EXECUTE_PUBLIC);interface('Missing') && interface('Missing').setValue(1)"),api);
 assert.deepEqual(calls,[[73,0]]);
 assert.throws(()=>parseUiCommands("interface('Hud').setValue(window.localStorage)"));
 assert.throws(()=>parseUiCommands("interface('Hud').setValue(window.client)"));
});

test('only allows initialization metadata callbacks with the read-only server name getter',async()=>{
 const calls=[];
 await executeUiOperations(parseUiCommands('sendClientEvent(gm.EVENT_EXECUTE_PUBLIC,"EndedInitializeMobile",window.getServerName());'),{getServerName:()=>"HASSLE",metadata:(...args)=>calls.push(args)});
 assert.deepEqual(calls,[["EndedInitializeMobile",["HASSLE"]]]);
 for(const name of ['OnAuth','OnRegistrationData','OnBuy'])assert.throws(()=>parseUiCommands(`sendClientEvent(gm.EVENT_EXECUTE_PUBLIC,"${name}",window.getServerName())`));
 assert.throws(()=>parseUiCommands('sendClientEvent(gm.EVENT_EXECUTE_PUBLIC,"EndedInitializeMobile",window.getPassword())'));
});
