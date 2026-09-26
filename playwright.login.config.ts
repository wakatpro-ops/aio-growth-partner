import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/login-feedback',workers:1,timeout:45000,reporter:'list',use:{baseURL:process.env.LOGIN_TEST_BASE_URL||'http://127.0.0.1:3191',trace:'off',screenshot:'off',video:'off'}});
