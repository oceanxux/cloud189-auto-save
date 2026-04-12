# REST API 文档

Cloud189 Auto Save 提供标准的 REST API 接口，方便第三方程序（如脚本、其他工具）进行集成。

## 1. 认证要求

所有请求必须在 HTTP Header 中包含 `x-api-key`：

```http
x-api-key: YOUR_SYSTEM_API_KEY
```
*API Key 可在系统设置 -> 系统配置中查看或修改。*

---

## 2. 接口列表

### 账号管理 (Accounts)
- **GET** `/api/accounts` - 获取所有账号。
- **GET** `/api/accounts/capacity/:id` - 获取指定账号容量。

### 任务管理 (Tasks)
- **GET** `/api/tasks` - 获取任务列表。
- **POST** `/api/tasks` - 创建新转存任务。
- **POST** `/api/tasks/:id/execute` - 立即执行指定任务。
- **POST** `/api/tasks/executeAll` - 执行所有待处理任务。

### 文件管理 (File Manager)
- **GET** `/api/file-manager/list` - 列出目录内容。
- **GET** `/api/file-manager/download-link` - 获取文件直链。
- **POST** `/api/file-manager/rename` - 重命名云盘文件。

### 媒体服务 (Emby/STRM)
- **POST** `/api/tasks/strm` - 批量生成 STRM 文件。
- **Emby 代理地址**：`http://YOUR_IP:8097`

---

## 3. 返回格式

所有接口均返回统一的 JSON 格式：

```json
{
    "success": true,
    "data": { ... },
    "error": "若失败则显示错误信息"
}
```
