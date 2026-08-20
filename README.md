# Capture

把 Obsidian 笔记中喜欢的一句话生成适合保存和分享的 PNG 卡片。卡片会明确显示：

- 摘句正文
- 作者或笔名
- 详细日期
- 来源笔记名称
- 紫色晶石标记与“摘自 Obsidian 日记”

## 安装

1. 在 Obsidian 中打开“设置 → 文件与链接”，找到当前 Vault 的位置。
2. 打开 Vault 里的 `.obsidian/plugins/` 文件夹。
3. 把整个插件文件夹复制进去。
4. 确认插件文件夹中至少有 `main.js`、`manifest.json`、`styles.css`。
5. 重启 Obsidian，或执行“重新加载应用”。
6. 打开“设置 → 第三方插件”，关闭安全模式后启用“Capture”。

## 使用

1. 在任意笔记中选中一句或一段文字。
2. 右键选择“使用 Capture 生成卡片”，也可以打开命令面板搜索生成摘句卡片。
3. 在预览窗口修改作者、日期、来源、风格和图片比例。
4. 选择“保存到 Vault”“复制图片”或“下载 PNG”。

默认保存位置为 `Attachments/Capture/`。可以在“设置 → Capture”中修改作者名、保存目录、默认风格与默认比例。

日期识别顺序：笔记属性中的 `date` / `created` / `day` → 文件名中的日期 → 文件创建时间。

## 开发

```bash
npm install
npm run build
```

插件基于 TypeScript 与 Obsidian 官方 API。
