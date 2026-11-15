<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
  <#if section = "header">
    <#if registration>注册 Nexora<#else>登录 Nexora</#if>
  <#elseif section = "form">
    <form id="otp-form" action="${url.loginAction}" method="post">
      <#if codeStage>
        <p role="status">${probeMessage}</p>
        <label for="code">六位验证码</label>
        <input id="code" name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required autofocus>
        <button class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!}" type="submit">验证</button>
        <button class="${properties.kcButtonClass!}" type="submit" name="restart" value="true" formnovalidate>重新开始</button>
      <#else>
        <label for="email">邮箱</label>
        <input id="email" name="email" type="email" maxlength="254" autocomplete="email" required autofocus>
        <button class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!}" type="submit">发送验证码</button>
      </#if>
    </form>
  </#if>
</@layout.registrationLayout>
