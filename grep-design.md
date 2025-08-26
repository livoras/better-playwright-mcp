# 使用原始 grep 的 LLM 指南

## 工具接口
```typescript
grepSnapshot(pattern: string, flags?: string): string
// 示例: grepSnapshot("button:", "-i -C 2")
```

## 基本 grep 用法

### 常用 flags
- `-i` 忽略大小写
- `-n` 显示行号
- `-C N` 显示前后N行上下文
- `-B N` 显示前N行
- `-A N` 显示后N行
- `-E` 使用扩展正则表达式
- `-m N` 只返回前N个匹配

## 搜索模式示例

### 查找元素
```bash
# 搜索框
grepSnapshot("searchbox")
grepSnapshot("textbox.*search", "-i -E")

# 按钮
grepSnapshot("button:")
grepSnapshot("button:.*登录", "-E")

# 链接
grepSnapshot("link:")

# 表单
grepSnapshot("form:")
grepSnapshot("textbox.*required", "-E")
```

### 查找属性
```bash
# 禁用的元素
grepSnapshot("\\[disabled\\]")

# 必填字段
grepSnapshot("\\[required\\]")

# 展开的元素
grepSnapshot("\\[expanded\\]")
```

### 使用上下文
```bash
# 获取按钮及其周围2行
grepSnapshot("button:", "-C 2")

# 获取表单及其后10行（查看表单内容）
grepSnapshot("form:", "-A 10")

# 带行号（用于定位）
grepSnapshot("navigation:", "-n")
```

## 任务执行示例

### 任务："搜索卷发棒"
```bash
# 1. 找搜索框
grepSnapshot("searchbox", "-n")
# 或
grepSnapshot("textbox.*search", "-i -E -n")

# 2. 找搜索按钮（获取搜索框后面的内容，找按钮）
grepSnapshot("button:.*search", "-i -E")
```

### 任务："找评论最多的产品"
```bash
# 1. 找所有评论数
grepSnapshot("[0-9]+ review", "-E")

# 2. 找产品链接或标题
grepSnapshot("link:", "-C 2")
grepSnapshot("heading:", "-C 2")
```

### 任务："登录"
```bash
# 1. 找用户名输入框
grepSnapshot("textbox.*user|email", "-i -E")

# 2. 找密码输入框
grepSnapshot("textbox.*password", "-i -E")

# 3. 找登录按钮
grepSnapshot("button.*login|sign in", "-i -E")
```

## 实用技巧

1. **使用管道思维**：先粗筛，再精筛
   ```bash
   # 先找到form区域
   grepSnapshot("form:", "-A 20")
   # 在结果中继续搜索需要的元素
   ```

2. **利用缩进理解层级**
   ```bash
   # 一级元素（行首）
   grepSnapshot("^- navigation", "-E")
   # 二级元素（2空格）
   grepSnapshot("^  - list", "-E")
   ```

3. **多个关键词**
   ```bash
   # OR 关系
   grepSnapshot("login\\|登录\\|sign in", "-i -E")
   # 包含多个词
   grepSnapshot("button.*submit", "-E")
   ```

## 根据任务选择 grep 策略

| 任务类型 | grep 模式 | flags |
|---------|-----------|-------|
| 找特定角色 | `"role:"` | `-n` |
| 找包含文本 | `".*text.*"` | `-i -E` |
| 找属性 | `"\\[attr\\]"` | |
| 获取上下文 | 任意 | `-C 3` |
| 找第一个 | 任意 | `-m 1` |
| 在区域内找 | 先找区域 | `-A 10` |

就这么简单，给 LLM 原始的 grep 能力，让它自己组合使用。
