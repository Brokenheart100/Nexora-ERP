<script setup lang="ts">
const route = useRoute()

const messages: Record<number, string> = {
  403: '当前演示身份没有访问该工作区的权限，可以切换到其他工作区继续浏览。',
  404: '演示：请求的页面不存在，请返回工作台。',
  500: '演示：页面在渲染时遇到异常，刷新后会恢复为模拟数据。'
}

const code = Number(route.params.code)
const message = messages[code]

if (!message) {
  throw createError({ statusCode: 404, message: '演示：未知的错误码。', fatal: true })
}

throw createError({ statusCode: code, message, fatal: true })
</script>

<template>
  <div />
</template>
