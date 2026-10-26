# Rainbow Highlight

A beautiful multi-color text highlighting plugin for [Obsidian](https://obsidian.md/).

一款简洁美观的 Obsidian 多彩文字高亮插件。

Select text and instantly apply a background highlight or text color from a floating palette — just like highlighting in a real book.

选中文字后，浮动调色板会立即出现。你可以像使用真实荧光笔一样设置背景高亮或文字颜色。

![Rainbow Highlight usage example](https://raw.githubusercontent.com/Norman-lawyer/obsidian-rainbow-highlight/main/assets/rainbow-highlight-demo.png)

*Select text, choose a color, and keep writing without leaving the note.*

*选中文字、挑选颜色，然后继续书写，全程无需离开当前笔记。*

## Features / 功能特点

- **Quick Color Palette** — A floating color picker appears beside the selected text.<br>**快速调色板** — 选中文字后，浮动调色板会出现在选区旁边。
- **7 Vibrant Colors** — Red, orange, yellow, green, cyan, blue, and purple.<br>**7 种鲜明配色** — 红、橙、黄、绿、青、蓝、紫。
- **Background + Text Color** — Combine any background with a separate text color for 49 possible combinations.<br>**背景色 + 文字色** — 两排颜色可以自由组合，共有 49 种配色方案。
- **Format Preserving** — Keeps bold, italic, and strikethrough content as Markdown.<br>**保留 Markdown 格式** — 粗体、斜体和删除线不会被破坏或改写。
- **Callout Support** — Highlights selections inside rendered callouts, including multiline text.<br>**支持 Callout** — 可以高亮渲染状态下 Callout 内的文字，包括跨行内容。
- **Precise Recoloring and Removal** — Recolor selected highlighted text instantly, or remove only the selected segment without affecting the rest.<br>**精准换色与取消** — 选中已高亮文字即可直接换色，也可只取消选中部分，不影响其余内容。
- **Native Highlight Compatibility** — The eraser also removes Obsidian `==highlight==` syntax while preserving nested bold, italic, and strikethrough formatting.<br>**兼容原生高亮** — 橡皮擦同样可取消 Obsidian 的 `==高亮==` 语法，并保留其中的粗体、斜体和删除线。
- **Customizable Palette** — Enable or hide individual colors, control automatic opening and popup delay, and reset everything from the bilingual settings page.<br>**可自定义调色盘** — 可在中英双语设置页中显示或隐藏颜色、调整自动弹出与延时，并一键恢复默认。
- **Desktop and Mobile Friendly** — Keyboard navigation, viewport-safe positioning, and larger touch targets make the palette comfortable on every device.<br>**桌面端与移动端友好** — 支持键盘导航、视口边界保护和更大的触控按钮。
- **Dark Mode Support** — Colors adapt to both light and dark themes.<br>**深色模式** — 配色会同时适配浅色与深色主题。
- **Command Palette** — Every background and text color is also available as a command.<br>**命令面板** — 每一种背景色和文字色都可以通过命令调用并设置快捷键。

## How to Use / 使用方法

1. Select any text in your note.<br>在笔记中选中需要强调的文字。
2. A two-row color palette appears near the selection.<br>选区附近会出现一个双排调色板。
3. Use the first row for the background and the second row for text color.<br>第一排设置背景色，第二排设置文字颜色。
4. Select another color to recolor an existing highlight. Use the eraser on the background row to remove all highlighting, or the text eraser to remove only the text color.<br>重新选择颜色即可换色。使用背景色一行的橡皮擦取消全部高亮，或使用文字色橡皮擦仅取消文字颜色。

Open **Settings → Rainbow Highlight** to customize the visible colors, automatic palette behavior, and popup delay.

打开 **设置 → Rainbow Highlight**，可自定义显示的颜色、调色盘自动弹出行为与弹出延时。

### Example / 使用示例

Highlight a conclusion in yellow, mark an action item in green, or combine a background with a contrasting text color.

你可以用黄色标记核心结论、用绿色标记行动事项，也可以组合背景色与文字颜色，建立清晰的信息层级。

The plugin stores highlights as readable HTML inside your Markdown file:

插件会将高亮以清晰可读的 HTML 形式保存在 Markdown 文件中：

```html
<mark class="hl-yellow">Important text / 重要内容</mark>
```

## Colors / 配色

Choose from seven background colors and seven text colors. The exact palette is shown below.

你可以分别选择 7 种背景色和 7 种文字色，实际色彩如下图所示。

![Rainbow Highlight color palette](https://raw.githubusercontent.com/Norman-lawyer/obsidian-rainbow-highlight/main/assets/rainbow-highlight-colors.png)

Legacy pink highlights remain fully supported, even though pink is not currently shown in the picker.

旧版本生成的粉色高亮仍可正常显示，但当前调色板中暂未提供粉色按钮。

## Installation / 安装

### From Obsidian Community Plugins / 从 Obsidian 插件市场安装

1. Open **Settings → Community plugins → Browse**.<br>打开 **设置 → 第三方插件 → 浏览**。
2. Search for **Rainbow Highlight**.<br>搜索 **Rainbow Highlight**。
3. Select **Install**, then **Enable**.<br>点击 **安装**，然后点击 **启用**。

### Manual Installation / 手动安装

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Norman-lawyer/obsidian-rainbow-highlight/releases).<br>从[最新版本](https://github.com/Norman-lawyer/obsidian-rainbow-highlight/releases)下载 `main.js`、`manifest.json` 和 `styles.css`。
2. Create a `rainbow-highlight` folder inside your vault's `.obsidian/plugins/` directory.<br>在笔记库的 `.obsidian/plugins/` 目录中创建 `rainbow-highlight` 文件夹。
3. Copy the three downloaded files into that folder.<br>将下载的三个文件复制到该文件夹。
4. Enable the plugin under **Settings → Community plugins**.<br>前往 **设置 → 第三方插件** 启用插件。

## License / 开源许可

Released under the [MIT License](LICENSE).

本项目基于 [MIT License](LICENSE) 开源。
