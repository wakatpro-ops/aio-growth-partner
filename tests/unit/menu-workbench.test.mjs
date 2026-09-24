import test from 'node:test';
import assert from 'node:assert/strict';
import {menuPermissions,itemAvailability,parseStockLines,menuTabs,itemPhoto} from '../../lib/menu-workbench-rules.ts';
const access=(organizationRoles={},storeRoles={})=>({accountActive:true,isPlatformAdmin:false,organizationRoles,storeRoles});
test('所属なし・別店舗・閲覧者に操作権を与えない',()=>{
 for(const user of [null,access(),access({other:'org_owner'}),access({}, {other:'staff'}),access({org:'viewer'})]) assert.deepEqual(menuPermissions(user,'org','store'),{manager:false,operate:false});
});
test('スタッフと店長の権限を分離する',()=>{
 assert.deepEqual(menuPermissions(access({}, {store:'staff'}),'org','store'),{operate:true,manager:false});
 assert.deepEqual(menuPermissions(access({}, {store:'store_manager'}),'org','store'),{operate:true,manager:true});
 assert.deepEqual(menuPermissions({...access({org:'org_owner'}),accountActive:false},'org','store'),{operate:false,manager:false});
});
test('停止と売り切れを区別する',()=>{
 assert.equal(itemAvailability({status:'inactive',availability:'sold_out'}),'paused');
 assert.equal(itemAvailability({status:'active',availability:'sold_out'}),'sold_out');
 assert.equal(itemAvailability({status:'active'}),'available');
});
function form(q='2',unit='箱') {const f=new FormData();f.append('item_id','item');f.append('line_name','商品');f.append('quantity',q);f.append('unit',unit);f.append('unit_price','100');return f;}
test('数量・単位を検証しスタッフの原価を送信しない',()=>{
 assert.equal(parseStockLines(form(),false)[0].unit_price,undefined);
 assert.equal(parseStockLines(form(),true)[0].unit_price,100);
 for(const q of ['0','-1','NaN','Infinity','0.001','1000001']) assert.throws(()=>parseStockLines(form(q),true));
 assert.throws(()=>parseStockLines(form('2',''),true));
 const f=form();for(const [k,v]of form())f.append(k,v);assert.throws(()=>parseStockLines(f,true));
});
test('業種別の言葉と安全な写真URL',()=>{
 assert.equal(menuTabs('restaurant')[1],'食材・仕入');
 assert.equal(menuTabs('beauty_salon')[1],'店販・在庫');
 assert.equal(itemPhoto({image_url:'javascript:alert(1)'}),null);
 assert.equal(itemPhoto({image_url:'https://example.com/menu.jpg'}),'https://example.com/menu.jpg');
});
