<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Nexora P0 邮箱登录</title></head>
<body>
<h1>邮箱登录</h1><p id="probe-message">${probeMessage}</p>
<form id="otp-form" action="${url.loginAction}" method="post">
<#if codeStage>
  <label for="code">六位验证码</label><input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
  <button type="submit">验证</button><button type="submit" name="restart" value="true" formnovalidate>重新开始</button>
<#else>
  <label for="email">邮箱</label><input id="email" name="email" type="email" maxlength="254" autocomplete="email" required>
  <button type="submit">发送验证码</button>
</#if>
</form><p>仅供 P0 本地技术验证</p></body></html>
