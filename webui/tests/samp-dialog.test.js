import test from 'node:test';
import assert from 'node:assert/strict';
import { mapServerDialog, makeDialogReply } from '../src/samp-dialog.js';
const dialog = { id: 12, token: 8, style: 0, title: 'Диалог <img>', body: '{FFAA00}Привет\r\nA\tB<n><script>', button1: 'Да', button2: 'Нет' };
test('server text is escaped before Sile newline/tab tokens are inserted',()=>{
 const result=mapServerDialog(dialog);
 assert.equal(result.uiId,1000008);assert.equal(result.params[2],'Диалог &lt;img&gt;');
 assert.equal(result.body,'{FFAA00}Привет<n>A<t>B&lt;n&gt;&lt;script&gt;');
});
test('all six SA:MP styles map without inventing a header for style 4',()=>{
 assert.deepEqual([0,1,2,3,4,5].map(style=>mapServerDialog({...dialog,style}).params[1]),[0,1,2,3,2,5]);
 assert.equal(mapServerDialog({...dialog,style:3}).private,true);
});
test('server replies retain the original ID and token, list index and cancel semantics',()=>{
 assert.deepEqual(makeDialogReply({...dialog,style:5},1,2,'ignored'),{id:12,token:8,button:1,item:2,text:''});
 assert.deepEqual(makeDialogReply({...dialog,style:3},1,-1,'dummy'),{id:12,token:8,button:1,item:-1,text:'dummy'});
 assert.deepEqual(makeDialogReply({...dialog,style:1},0,0,'discard'),{id:12,token:8,button:0,item:-1,text:''});
});
test('malformed or unsupported dialog descriptors are rejected',()=>{
 for(const value of [{...dialog,id:-1},{...dialog,style:6},{...dialog,token:0},null])assert.throws(()=>mapServerDialog(value));
});
