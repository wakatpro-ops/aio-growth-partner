import assert from 'node:assert/strict';
import test from 'node:test';
import {selectLoginStores} from '../../lib/auth/login-session-policy.ts';
test('store-only staff never inherit all stores in the parent organization',()=>{
 assert.deepEqual(selectLoginStores({organizationIds:[],directStoreIds:['a'],activeOrganizationIds:['org'],stores:[{id:'a',organization_id:'org'},{id:'b',organization_id:'org'}]}),['a']);
});
test('organization owners retain all active stores of their organization',()=>{
 assert.deepEqual(selectLoginStores({organizationIds:['org'],directStoreIds:[],activeOrganizationIds:['org'],stores:[{id:'a',organization_id:'org'},{id:'b',organization_id:'org'},{id:'c',organization_id:'foreign'}]}),['a','b']);
});
test('inactive organizations and membershipless users cannot get a login destination',()=>{
 assert.deepEqual(selectLoginStores({organizationIds:['org'],directStoreIds:['a'],activeOrganizationIds:[],stores:[{id:'a',organization_id:'org'}]}),[]);
 assert.deepEqual(selectLoginStores({organizationIds:[],directStoreIds:[],activeOrganizationIds:['org'],stores:[{id:'a',organization_id:'org'}]}),[]);
});
