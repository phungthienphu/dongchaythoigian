import test from 'node:test';
import assert from 'node:assert/strict';
import { envoyWorldRoutes } from './envoy-world';
import { worldWarMessage } from './world-service-status';
const ns=[{id:'home',me:true,name:'Home',x:10,y:10},{id:'target',me:false,name:'Target',x:20,y:30}];
const trip={id:1,target:'target',targetName:'Target',depart:1000,arrive:11000,back:21000};
test('battle UI distinguishes sign-in, loading, failed fetch and missing configuration',()=>{
 assert.match(worldWarMessage(false,'idle',false)!,/Đăng nhập/);
 assert.match(worldWarMessage(true,'idle',false)!,/Đang kiểm tra/);
 assert.match(worldWarMessage(true,'loading',false)!,/Đang kiểm tra/);
 assert.equal(worldWarMessage(true,'error',false,'Lỗi tải API'),'Lỗi tải API');
 assert.match(worldWarMessage(true,'ready',false)!,/chưa được cấu hình/);
 assert.equal(worldWarMessage(true,'ready',true),null);
});
test('own known-target envoy route is visible immediately, moves out and back, and expires on return',()=>{
 const city={trips:[trip]};
 assert.equal(envoyWorldRoutes(city,ns,999).length,0);
 assert.equal(envoyWorldRoutes(city,ns,1000)[0].x,10);
 const halfway=envoyWorldRoutes(city,ns,6000)[0];assert.equal(halfway.x,15);assert.equal(halfway.y,20);assert.equal(halfway.returning,false);
 assert.equal(envoyWorldRoutes(city,ns,11000)[0].returning,true);
 assert.equal(envoyWorldRoutes(city,ns,16000)[0].x,15);
 assert.equal(envoyWorldRoutes(city,ns,21000).length,0);
});
test('unknown scouting destinations and invalid routes never leak a world location',()=>{
 assert.deepEqual(envoyWorldRoutes({trips:[{...trip,target:'',scouting:true}]},ns,6000),[]);
 assert.deepEqual(envoyWorldRoutes({trips:[trip]},ns.slice(0,1),6000),[]);
 assert.deepEqual(envoyWorldRoutes({trips:[trip]},ns.slice(1),6000),[]);
 assert.deepEqual(envoyWorldRoutes({trips:[{...trip,arrive:1000}]},ns,6000),[]);
});
