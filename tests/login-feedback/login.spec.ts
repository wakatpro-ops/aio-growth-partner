import {test,expect} from '@playwright/test';
test('a slow login locks immediately and recovers after invalid credentials',async({page})=>{
 let calls=0;let release:()=>void=()=>{};
 await page.route('**/auth/v1/token**',async route=>{calls++;await new Promise<void>(r=>{release=r;});await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'invalid_grant',error_description:'Invalid login credentials'})});});
 await page.goto('/login');
 await page.getByLabel('メール',{exact:true}).fill('login-test@example.invalid');
 await page.getByLabel('パスワード',{exact:true}).fill('Synthetic-password-only-9!');
 const button=page.getByRole('button',{name:'ログイン',exact:true});await expect(button).toBeEnabled();
 await button.click();
 await expect(page.getByTestId('login-progress')).toBeVisible({timeout:1000});
 await expect(page.locator('button[type=submit]')).toBeDisabled();
 await page.locator('form').evaluate(form=>{(form as HTMLFormElement).requestSubmit();(form as HTMLFormElement).requestSubmit();});
 await expect.poll(()=>calls).toBe(1);release();
 await expect(page.getByText('ログインできませんでした。メールアドレスとパスワードを確認してください。')).toBeVisible();
 await expect(button).toBeEnabled();
});
test('a disconnected authentication request times out and permits retry on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/auth/v1/token**',async()=>{ /* deliberately never returns */ });
 await page.goto('/login');
 await page.getByLabel('メール',{exact:true}).fill('login-test@example.invalid');
 await page.getByLabel('パスワード',{exact:true}).fill('Synthetic-password-only-9!');
 await page.getByRole('button',{name:'ログイン',exact:true}).click();
 await expect(page.getByTestId('login-progress')).toBeVisible({timeout:1000});
 await expect(page.getByText('少し時間がかかっています。そのままお待ちください。')).toBeVisible({timeout:8000});
 await page.screenshot({path:'/private/tmp/aiob-login-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await expect(page.getByText('接続に時間がかかっています。通信環境を確認して、もう一度お試しください。')).toBeVisible({timeout:32000});
 await expect(page.getByRole('button',{name:'ログイン',exact:true})).toBeEnabled();
});
test('without JavaScript credentials cannot be accidentally submitted as a URL',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false});
 try{
  const page=await context.newPage();await page.goto(`${process.env.LOGIN_TEST_BASE_URL||'http://127.0.0.1:3191'}/login`);
  await expect(page.getByRole('button',{name:'ログイン',exact:true})).toBeDisabled();
  await expect(page.locator('form')).toHaveAttribute('method','post');
 }finally{await context.close();}
});
test('keyboard submission uses the same lock and session failures allow retry',async({page})=>{
 const now=Math.floor(Date.now()/1000),encoded=Buffer.from(JSON.stringify({exp:now+3600,sub:'test'})).toString('base64url');
 await page.route('**/auth/v1/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:`e30.${encoded}.test`,refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,user:{id:'synthetic',email:'login-test@example.invalid',aud:'authenticated',created_at:new Date().toISOString()}})}));
 let sessions=0;
 await page.route('**/api/auth/session',async route=>{sessions++;await new Promise(r=>setTimeout(r,1000));await route.abort('failed');});
 await page.goto('/login');await page.getByLabel('メール',{exact:true}).fill('login-test@example.invalid');await page.getByLabel('パスワード',{exact:true}).fill('Synthetic-password-only-9!');
 await expect(page.getByRole('button',{name:'ログイン',exact:true})).toBeEnabled();await page.getByLabel('パスワード',{exact:true}).press('Enter');
 await expect(page.getByTestId('login-progress')).toBeVisible();
 await expect(page.getByText('通信を確認できませんでした。接続を確認して、もう一度お試しください。')).toBeVisible();
 await expect(page.getByRole('button',{name:'ログイン',exact:true})).toBeEnabled();expect(sessions).toBe(1);
});
test('the form stays locked through session creation and navigates on success',async({page})=>{
 const now=Math.floor(Date.now()/1000),encoded=Buffer.from(JSON.stringify({exp:now+3600,sub:'test'})).toString('base64url');
 await page.route('**/auth/v1/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:`e30.${encoded}.test`,refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,user:{id:'synthetic',email:'login-test@example.invalid',aud:'authenticated',created_at:new Date().toISOString()}})}));
 let sessions=0;let release:()=>void=()=>{};
 await page.route('**/api/auth/session',async route=>{sessions++;await new Promise<void>(r=>{release=r;});await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,next_path:'/login-feedback-success'})});});
 await page.route('**/login-feedback-success',route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Logged in</h1>'}));
 await page.goto('/login');await page.getByLabel('メール',{exact:true}).fill('login-test@example.invalid');await page.getByLabel('パスワード',{exact:true}).fill('Synthetic-password-only-9!');
 await page.getByRole('button',{name:'ログイン',exact:true}).click();
 await expect(page.getByText('利用できる店舗を確認しています。')).toBeVisible();
 await expect(page.locator('button[type=submit]')).toBeDisabled();
 await page.locator('form').evaluate(form=>(form as HTMLFormElement).requestSubmit());
 await expect.poll(()=>sessions).toBe(1);release();
 await expect(page.getByRole('heading',{name:'Logged in'})).toBeVisible();
});
