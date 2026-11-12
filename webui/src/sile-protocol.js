import { parse } from 'acorn';
const constantRef=Symbol('UI constant');
const getterRef=Symbol('UI getter');
const forbidden = new Set(['__proto__','prototype','constructor','caller','callee','arguments']);
const globals = new Set(['openInterface','closeInterface','showInterface','hideInterface','updateParams','addDialogInQueue','closeLastDialog','clearAllDialogs','confirmBrowserInitialize','playSound','stopSound','setPlayerConnectedStatus','setPlayerNickName','setPlayerMoney','setPlayerLevel','setPlayerExp','setCursorStatus','setCursorMovementBlocked','setUseNativeKeyboard','hideKeyboard','showKeyboard','setHudStatus','setDrawLabelStatus','onChatMessage','pushToast','clearToasts','setProgressBar','setPlayerSettings','openMainMenuFromUI','setVehiclePaintJob']);
const methods = /^(?:(?:set|update|show|hide|close|open|add|remove|clear|reset|stop|play|push|confirm|refresh|start|finish|enable|disable|load|destroy|check)[A-Z_]|(?:open|close|hide|show|add|remove|clear|reset|play|stop|set)$)/;
function key(node) {const value=node?.type==='Identifier'?node.name:node?.type==='Literal'?node.value:null;if(typeof value!=='string'||forbidden.has(value)||!/^[A-Za-z_$][\w$]*$/.test(value))throw Error('Unsupported UI property');return value;}
function data(value,depth=0){if(depth>24)throw Error('UI data nesting limit');if(Array.isArray(value))return value.map(v=>data(v,depth+1));if(value&&typeof value==='object'){for(const k of Object.keys(value)){if(forbidden.has(k))throw Error('Forbidden UI data key');data(value[k],depth+1);}}return value;}
function constantPath(node){
 if(node.type==='Identifier')return [node.name];
 if(node.type==='MemberExpression')return [...constantPath(node.object),key(node.property)];
 throw Error('Unsupported UI constant');
}
function literal(node,depth=0){
 if(node?.type==='CallExpression'&&node.arguments.length===0&&node.callee.type==='MemberExpression'&&node.callee.object.type==='Identifier'&&node.callee.object.name==='window'&&key(node.callee.property)==='getServerName')return {[getterRef]:'getServerName'};
 if(depth>24)throw Error('UI argument nesting limit');
 if(!node)return undefined;
 if(node.type==='MemberExpression'){
  const path=constantPath(node);
  if(!((path[0]==='gm'&&path.length===2)||(path[0]==='window'&&path.length===2&&path[1].startsWith('KEY_CODE_'))))throw Error('Unsupported UI constant');
  return {[constantRef]:path};
 }
 if(node.type==='Literal'){if(node.regex||typeof node.value==='bigint')throw Error('Unsupported UI literal');return node.value;}
 if(node.type==='Identifier'&&node.name==='undefined')return undefined;
 if(node.type==='UnaryExpression'&&['+','-','!'].includes(node.operator)){const v=literal(node.argument,depth+1);if(node.operator==='!')return !v;if(typeof v!=='number')throw Error('Invalid UI number');return node.operator==='-'?-v:v;}
 if(node.type==='ArrayExpression')return node.elements.map(v=>literal(v,depth+1));
 if(node.type==='ObjectExpression'){const result=Object.create(null);for(const p of node.properties){if(p.type!=='Property'||p.kind!=='init'||p.method||p.computed)throw Error('Unsupported UI object');result[key(p.key)]=literal(p.value,depth+1);}return result;}
 if(node.type==='TemplateLiteral'&&node.expressions.length===0)return node.quasis[0].value.cooked;
 if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&node.callee.object.type==='Identifier'&&node.callee.object.name==='JSON'&&key(node.callee.property)==='parse'&&node.arguments.length===1){const text=literal(node.arguments[0],depth+1);if(typeof text!=='string')throw Error('Invalid UI JSON');return data(JSON.parse(text));}
 throw Error('Unsupported UI argument '+node.type);
}
function interfaceCall(node){return node?.type==='CallExpression'&&((node.callee.type==='Identifier'&&['interface','getInterfaceStatus'].includes(node.callee.name))||(node.callee.type==='MemberExpression'&&node.callee.object.type==='Identifier'&&node.callee.object.name==='window'&&['interface','getInterfaceStatus'].includes(key(node.callee.property))));}
function receiver(node){
 if(interfaceCall(node)&&node.arguments.length===1){const name=literal(node.arguments[0]);if(typeof name!=='string'||!/^[A-Za-z][\w]*$/.test(name))throw Error('Invalid interface name');return {interface:name,path:[]};}
 if(node.type==='MemberExpression'){const root=receiver(node.object),part=key(node.property);if(part.startsWith('$')&&part!=='$refs')throw Error('Unsupported Vue property');if(root.path.length>=8)throw Error('UI reference depth');root.path.push(part);return root;}
 throw Error('Unsupported UI receiver');
}
function call(node){
 let target=node.callee;
 if(target.type==='MemberExpression'&&target.object.type==='Identifier'&&target.object.name==='window')target={type:'Identifier',name:key(target.property)};
 const args=node.arguments.map(v=>literal(v));
 if(target.type==='Identifier'&&target.name==='sendClientEvent'){
  if(args.length!==3||!args[0]?.[constantRef]||args[0][constantRef].join('.')!=='gm.EVENT_EXECUTE_PUBLIC'||!['EndedInitializeMobile','EndedInitializeBrowser'].includes(args[1])||args[2]?.[getterRef]!=='getServerName')throw Error('Unsupported server callback');
  return {kind:'metadata',name:args[1],args:[args[2]]};
 }
 if(target.type==='Identifier'){if(!globals.has(target.name))throw Error('Unsupported UI global '+target.name);return {kind:'global',name:target.name,args};}
 if(target.type==='MemberExpression'){
  const name=key(target.property);
  if(target.object.type==='Identifier'&&target.object.name==='client') {if(!['setHudStatus','setChatStatus','setCursorStatus'].includes(name))throw Error('Unsupported client UI method');return {kind:'client',name,args};}
  if(!methods.test(name))throw Error('Unsupported UI method '+name);
  return {kind:'call',...receiver(target.object),name,args};
 }
 throw Error('Unsupported UI call');
}
export function parseUiCommands(source){
 if(typeof source!=='string'||source.length>65536)throw Error('UI source size limit');
 const program=parse(source,{ecmaVersion:2020});if(program.body.length>128)throw Error('UI statement count limit');
 const operations=[];
 for(const statement of program.body){
  if(statement.type==='EmptyStatement')continue;
  if(statement.type!=='ExpressionStatement')throw Error('Unsupported UI statement '+statement.type);
  const node=statement.expression;
  if(node.type==='LogicalExpression'&&node.operator==='&&'&&interfaceCall(node.left)&&node.right.type==='CallExpression'){
   const name=literal(node.left.arguments[0]);if(typeof name!=='string'||!/^[A-Za-z][\w]*$/.test(name))throw Error('Invalid interface guard');operations.push({kind:'guard',interface:name,operation:call(node.right)});
  }
  else if(node.type==='CallExpression')operations.push(call(node));
  else if(node.type==='AssignmentExpression'&&node.operator==='='&&node.left.type==='MemberExpression'){
   const name=key(node.left.property);if(name.startsWith('$'))throw Error('Unsupported assignment');operations.push({kind:'set',...receiver(node.left.object),name,value:literal(node.right)});
  }else throw Error('Unsupported UI expression '+node.type);
 }
 return operations;
}
function resolveValue(value,api){
 if(value&&value[getterRef]){if(value[getterRef]!=='getServerName'||typeof api.getServerName!=='function')throw Error('Unavailable UI getter');return String(api.getServerName()).slice(0,64);}
 if(value&&value[constantRef]){const path=value[constantRef];let current=api.constants;for(const name of path)current=current?.[name];if(!['number','string','boolean'].includes(typeof current))throw Error('Unavailable UI constant');return current;}
 if(Array.isArray(value))return value.map(v=>resolveValue(v,api));
 if(value&&typeof value==='object'){const result=Object.create(null);for(const name of Object.keys(value))result[name]=resolveValue(value[name],api);return result;}
 return value;
}
export async function executeUiOperations(operations,api){
 for(const op of operations){
  if(api.active&&!api.active())return;
  if(op.kind==='guard'){if(api.exists?.(op.interface))await executeUiOperations([op.operation],api);continue;}
  const args=(op.args||[]).map(v=>resolveValue(v,api));
  if(op.kind==='metadata'){if(typeof api.metadata!=='function')throw Error('Unavailable UI metadata callback');await api.metadata(op.name,args);}
  else if(op.kind==='global'){if(!globals.has(op.name)||typeof api.globals[op.name]!=='function')throw Error('Unavailable UI global '+op.name);await api.globals[op.name](...args);}
  else if(op.kind==='client'){if(typeof api.client?.[op.name]!=='function')throw Error('Unavailable client UI method');await api.client[op.name](...args);}
  else {
   let target=await api.interface(op.interface);
   for(const part of op.path){if(forbidden.has(part)||!target)throw Error('Unavailable UI reference');target=target[part];}
   if(!target)throw Error('Unavailable interface '+op.interface);
   if(op.kind==='call'){if(!methods.test(op.name)||typeof target[op.name]!=='function')throw Error('Unavailable UI method '+op.name);await target[op.name](...args);}
   else if(op.kind==='set')target[op.name]=resolveValue(op.value,api);
  }
 }
}
export const uiGlobalNames = Object.freeze([...globals]);

export function summarizeUiCommand(source){
 try {const result=[];const tree=parse(source,{ecmaVersion:2020});const seen=new Set();function visit(node){if(!node||typeof node!=='object')return;if(node.type==='Identifier'&&!seen.has(node.name)){seen.add(node.name);result.push(node.name.slice(0,40));}for(const [k,v]of Object.entries(node))if(k!=='value'&&k!=='raw'&&v&&typeof v==='object'){if(Array.isArray(v))v.forEach(visit);else visit(v);}}visit(tree);return result.slice(0,20).join('.');}catch{return 'unparsed';}
}
