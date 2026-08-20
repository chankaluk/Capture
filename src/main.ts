import {
  App,
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Menu,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
} from "obsidian";

interface ShijuSettings {
  authorName: string;
  saveFolder: string;
  defaultTheme: CardTheme;
  defaultRatio: CardRatio;
  showVaultName: boolean;
}

type CardTheme = "paper" | "obsidian";
type CardRatio = "square" | "portrait" | "landscape";

const DEFAULT_SETTINGS: ShijuSettings = {
  authorName: "你的名字",
  saveFolder: "Attachments/Catch",
  defaultTheme: "paper",
  defaultRatio: "square",
  showVaultName: false,
};

interface CardData {
  quote: string;
  author: string;
  date: string;
  noteName: string;
  vaultName: string;
  theme: CardTheme;
  ratio: CardRatio;
}

export default class ShijuPlugin extends Plugin {
  settings: ShijuSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "create-quote-card-from-selection",
      name: "将选中文字生成摘句卡片",
      editorCheckCallback: (checking, editor, view) => {
        const hasSelection = editor.getSelection().trim().length > 0;
        if (hasSelection && !checking) this.openCardModal(editor, view);
        return hasSelection;
      },
    });

    this.registerEvent(
      this.app.workspace.on(
        "editor-menu",
        (menu: Menu, editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
          if (!editor.getSelection().trim()) return;
          menu.addSeparator();
          menu.addItem((item) =>
            item
              .setTitle("使用 Catch 生成卡片")
              .setIcon("quote")
              .onClick(() => this.openCardModal(editor, view)),
          );
        },
      ),
    );

    this.addRibbonIcon("quote", "Catch：生成摘录卡片", () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const selection = view?.editor.getSelection().trim();
      if (!view || !selection) {
        new Notice("请先在笔记中选中一句话");
        return;
      }
      this.openCardModal(view.editor, view);
    });

    this.addSettingTab(new ShijuSettingTab(this.app, this));
  }

  private openCardModal(
    editor: Editor,
    view: MarkdownView | MarkdownFileInfo,
  ): void {
    const quote = editor.getSelection().trim();
    if (!quote) {
      new Notice("请先选中一句或一段文字");
      return;
    }

    const file = view.file;
    const data: CardData = {
      quote,
      author: this.settings.authorName,
      date: this.getDisplayDate(file),
      noteName: file?.basename ?? "未命名笔记",
      vaultName: this.settings.showVaultName
        ? this.app.vault.getName()
        : "",
      theme: this.settings.defaultTheme,
      ratio: this.settings.defaultRatio,
    };

    new QuoteCardModal(this.app, this, data).open();
  }

  private getDisplayDate(file: TFile | null): string {
    if (!file) return formatChineseDate(new Date());

    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const candidate = frontmatter?.date ?? frontmatter?.created ?? frontmatter?.day;
    const parsedPropertyDate = parseDateValue(candidate);
    if (parsedPropertyDate) return formatChineseDate(parsedPropertyDate);

    const filenameDate = file.basename.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (filenameDate) {
      const [, year, month, day] = filenameDate;
      return formatChineseDate(
        new Date(Number(year), Number(month) - 1, Number(day)),
      );
    }

    return formatChineseDate(new Date(file.stat.ctime));
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class QuoteCardModal extends Modal {
  private canvas!: HTMLCanvasElement;
  private previewWrap!: HTMLElement;

  constructor(
    app: App,
    private readonly plugin: ShijuPlugin,
    private readonly data: CardData,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("shiju-modal");
    this.titleEl.setText("Catch");

    const layout = this.contentEl.createDiv({ cls: "shiju-layout" });
    const controls = layout.createDiv({ cls: "shiju-controls" });
    this.previewWrap = layout.createDiv({ cls: "shiju-preview-wrap" });
    this.canvas = this.previewWrap.createEl("canvas", { cls: "shiju-canvas" });

    new Setting(controls)
      .setName("摘句")
      .setDesc("可以在导出前修正文字")
      .addTextArea((text) => {
        text.setValue(this.data.quote);
        text.inputEl.rows = 5;
        text.onChange((value) => {
          this.data.quote = value.trim();
          this.renderPreview();
        });
      });

    new Setting(controls).setName("作者").addText((text) =>
      text.setValue(this.data.author).onChange((value) => {
        this.data.author = value.trim();
        this.renderPreview();
      }),
    );

    new Setting(controls).setName("日期").addText((text) =>
      text.setValue(this.data.date).onChange((value) => {
        this.data.date = value.trim();
        this.renderPreview();
      }),
    );

    new Setting(controls).setName("来源笔记").addText((text) =>
      text.setValue(this.data.noteName).onChange((value) => {
        this.data.noteName = value.trim();
        this.renderPreview();
      }),
    );

    new Setting(controls).setName("卡片风格").addDropdown((dropdown) =>
      dropdown
        .addOption("paper", "米白纸张")
        .addOption("obsidian", "黑曜紫")
        .setValue(this.data.theme)
        .onChange((value) => {
          this.data.theme = value as CardTheme;
          this.renderPreview();
        }),
    );

    new Setting(controls).setName("图片比例").addDropdown((dropdown) =>
      dropdown
        .addOption("square", "正方形 · 1:1")
        .addOption("portrait", "竖版 · 3:4")
        .addOption("landscape", "横版 · 16:9")
        .setValue(this.data.ratio)
        .onChange((value) => {
          this.data.ratio = value as CardRatio;
          this.renderPreview();
        }),
    );

    const hint = controls.createDiv({ cls: "shiju-hint" });
    hint.setText("Obsidian 标识会固定显示在卡片底部，确保出处清楚。");

    const actions = controls.createDiv({ cls: "shiju-actions" });
    const saveButton = actions.createEl("button", {
      text: "保存到 Vault",
      cls: "mod-cta",
    });
    saveButton.addEventListener("click", () => void this.saveToVault());

    const copyButton = actions.createEl("button", { text: "复制图片" });
    copyButton.addEventListener("click", () => void this.copyImage());

    const downloadButton = actions.createEl("button", { text: "下载 PNG" });
    downloadButton.addEventListener("click", () => void this.downloadImage());

    this.renderPreview();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderPreview(): void {
    const dimensions = getDimensions(this.data.ratio);
    this.canvas.width = dimensions.width;
    this.canvas.height = dimensions.height;
    this.previewWrap.toggleClass("is-landscape", this.data.ratio === "landscape");

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    drawCard(ctx, dimensions.width, dimensions.height, this.data);
  }

  private async getPngBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("无法生成图片"));
      }, "image/png");
    });
  }

  private async saveToVault(): Promise<void> {
    try {
      const blob = await this.getPngBlob();
      const folder = normalizePath(this.plugin.settings.saveFolder.trim());
      if (folder) await ensureFolder(this.app, folder);

      const basename = sanitizeFilename(
        `Catch-${this.data.noteName}-${Date.now()}.png`,
      );
      const path = normalizePath(folder ? `${folder}/${basename}` : basename);
      await this.app.vault.createBinary(path, await blob.arrayBuffer());
      new Notice(`卡片已保存：${path}`);
    } catch (error) {
      console.error(error);
      new Notice("保存失败，请打开开发者控制台查看详情");
    }
  }

  private async copyImage(): Promise<void> {
    try {
      const blob = await this.getPngBlob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      new Notice("卡片图片已复制到剪贴板");
    } catch (error) {
      console.error(error);
      new Notice("当前设备不支持直接复制，请使用“保存到 Vault”");
    }
  }

  private async downloadImage(): Promise<void> {
    try {
      const blob = await this.getPngBlob();
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = sanitizeFilename(`Catch-${this.data.noteName}.png`);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error(error);
      new Notice("下载失败，请尝试保存到 Vault");
    }
  }
}

class ShijuSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: ShijuPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Catch 设置" });

    new Setting(containerEl)
      .setName("作者名")
      .setDesc("显示在每张卡片右下角")
      .addText((text) =>
        text
          .setPlaceholder("你的名字或笔名")
          .setValue(this.plugin.settings.authorName)
          .onChange(async (value) => {
            this.plugin.settings.authorName = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("保存文件夹")
      .setDesc("相对于当前 Vault 根目录")
      .addText((text) =>
        text
          .setPlaceholder("Attachments/Catch")
          .setValue(this.plugin.settings.saveFolder)
          .onChange(async (value) => {
            this.plugin.settings.saveFolder = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("默认风格").addDropdown((dropdown) =>
      dropdown
        .addOption("paper", "米白纸张")
        .addOption("obsidian", "黑曜紫")
        .setValue(this.plugin.settings.defaultTheme)
        .onChange(async (value) => {
          this.plugin.settings.defaultTheme = value as CardTheme;
          await this.plugin.saveSettings();
        }),
    );

    new Setting(containerEl).setName("默认比例").addDropdown((dropdown) =>
      dropdown
        .addOption("square", "正方形 · 1:1")
        .addOption("portrait", "竖版 · 3:4")
        .addOption("landscape", "横版 · 16:9")
        .setValue(this.plugin.settings.defaultRatio)
        .onChange(async (value) => {
          this.plugin.settings.defaultRatio = value as CardRatio;
          await this.plugin.saveSettings();
        }),
    );

    new Setting(containerEl)
      .setName("显示 Vault 名称")
      .setDesc("公开分享时可能暴露资料库名称，默认关闭")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showVaultName)
          .onChange(async (value) => {
            this.plugin.settings.showVaultName = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: CardData,
): void {
  const dark = data.theme === "obsidian";
  const palette = dark
    ? {
        bg: "#17131F",
        bg2: "#241A34",
        text: "#F4EEF9",
        muted: "#B9ACC8",
        line: "rgba(203, 179, 230, 0.22)",
        accent: "#A88BFA",
      }
    : {
        bg: "#F3ECE2",
        bg2: "#E8DCCA",
        text: "#443D59",
        muted: "#756D7E",
        line: "rgba(68, 61, 89, 0.18)",
        accent: "#7654B4",
      };

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, palette.bg);
  gradient.addColorStop(1, palette.bg2);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawBackgroundTexture(ctx, width, height, palette.accent, dark);

  const side = Math.round(width * (data.ratio === "landscape" ? 0.09 : 0.1));
  const top = Math.round(height * 0.105);
  const footerHeight = Math.max(170, Math.round(height * 0.17));

  ctx.fillStyle = palette.accent;
  ctx.font = `600 ${Math.round(Math.min(width, height) * 0.021)}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
  ctx.letterSpacing = `${Math.max(2, width * 0.003)}px`;
  ctx.fillText("CATCH  ·  QUOTE FROM MY NOTES", side, top);
  ctx.letterSpacing = "0px";

  const quoteTop = top + Math.round(height * 0.12);
  const quoteBottom = height - footerHeight - Math.round(height * 0.08);
  const maxQuoteWidth = width - side * 2;
  const maxQuoteHeight = quoteBottom - quoteTop;

  ctx.fillStyle = palette.accent;
  ctx.globalAlpha = 0.32;
  ctx.font = `700 ${Math.round(Math.min(width, height) * 0.13)}px Georgia, serif`;
  ctx.fillText("“", side - 8, quoteTop + Math.round(height * 0.04));
  ctx.globalAlpha = 1;

  const quoteLayout = fitQuote(
    ctx,
    data.quote || "在这里写下值得记住的一句话",
    maxQuoteWidth,
    maxQuoteHeight,
    data.ratio,
  );
  ctx.fillStyle = palette.text;
  ctx.font = quoteLayout.font;
  ctx.textBaseline = "top";
  const textBlockHeight = quoteLayout.lines.length * quoteLayout.lineHeight;
  const startY = quoteTop + Math.max(0, (maxQuoteHeight - textBlockHeight) / 2);
  quoteLayout.lines.forEach((line, index) => {
    ctx.fillText(line, side, startY + index * quoteLayout.lineHeight);
  });

  const footerY = height - footerHeight;
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(side, footerY);
  ctx.lineTo(width - side, footerY);
  ctx.stroke();

  const logoSize = Math.round(Math.min(width, height) * 0.058);
  const logoY = footerY + Math.round((footerHeight - logoSize) / 2);
  drawObsidianMark(ctx, side, logoY, logoSize);

  const metaX = side + logoSize + Math.round(width * 0.022);
  ctx.fillStyle = palette.text;
  ctx.font = `600 ${Math.round(Math.min(width, height) * 0.023)}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("摘自 Obsidian 日记", metaX, logoY + logoSize * 0.42);

  ctx.fillStyle = palette.muted;
  ctx.font = `400 ${Math.round(Math.min(width, height) * 0.017)}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
  const source = [data.date, data.noteName, data.vaultName].filter(Boolean).join("  ·  ");
  const clippedSource = clipText(ctx, source, width * 0.52);
  ctx.fillText(clippedSource, metaX, logoY + logoSize * 0.83);

  const author = data.author ? `—— ${data.author}` : "";
  ctx.fillStyle = palette.text;
  ctx.font = `500 ${Math.round(Math.min(width, height) * 0.021)}px "Songti SC", "STSong", serif`;
  ctx.textAlign = "right";
  ctx.fillText(author, width - side, logoY + logoSize * 0.6);
  ctx.textAlign = "left";
}

function drawBackgroundTexture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accent: string,
  dark: boolean,
): void {
  ctx.save();
  ctx.globalAlpha = dark ? 0.08 : 0.055;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, width / 800);

  const step = Math.max(42, Math.round(width / 18));
  for (let x = -height; x < width + height; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawObsidianMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const points = {
    top: [x + size * 0.48, y] as const,
    right: [x + size, y + size * 0.48] as const,
    bottom: [x + size * 0.48, y + size] as const,
    left: [x, y + size * 0.48] as const,
    center: [x + size * 0.52, y + size * 0.48] as const,
  };

  fillPolygon(ctx, [points.top, points.right, points.center], "#A88BFA");
  fillPolygon(ctx, [points.right, points.bottom, points.center], "#6F4BC4");
  fillPolygon(ctx, [points.bottom, points.left, points.center], "#4B2A87");
  fillPolygon(ctx, [points.left, points.top, points.center], "#8766D7");
}

function fillPolygon(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
  color: string,
): void {
  const first = points[0];
  if (!first) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
  ctx.closePath();
  ctx.fill();
}

function fitQuote(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  ratio: CardRatio,
): { lines: string[]; lineHeight: number; font: string } {
  let fontSize = Math.round(
    Math.min(maxWidth, maxHeight) * (ratio === "landscape" ? 0.105 : 0.115),
  );
  const minSize = Math.max(32, Math.round(Math.min(maxWidth, maxHeight) * 0.052));

  while (fontSize >= minSize) {
    const font = `600 ${fontSize}px "Songti SC", "STSong", "Noto Serif SC", serif`;
    ctx.font = font;
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = Math.round(fontSize * 1.55);
    if (lines.length * lineHeight <= maxHeight) return { lines, lineHeight, font };
    fontSize -= 2;
  }

  const font = `600 ${minSize}px "Songti SC", "STSong", "Noto Serif SC", serif`;
  ctx.font = font;
  const lineHeight = Math.round(minSize * 1.5);
  const allLines = wrapText(ctx, text, maxWidth);
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  const lines = allLines.slice(0, maxLines);
  if (allLines.length > maxLines) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = clipText(ctx, `${lines[lastIndex] ?? ""}…`, maxWidth);
  }
  return {
    lines,
    lineHeight,
    font,
  };
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const result: string[] = [];
  const paragraphs = text.replace(/\r/g, "").split("\n");

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      result.push("");
      continue;
    }

    let line = "";
    for (const character of Array.from(paragraph)) {
      const candidate = line + character;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        result.push(line.trimEnd());
        line = character.trimStart();
      } else {
        line = candidate;
      }
    }
    if (line) result.push(line.trimEnd());
  }

  return result.length ? result : [""];
}

function clipText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

function getDimensions(ratio: CardRatio): { width: number; height: number } {
  if (ratio === "portrait") return { width: 1080, height: 1440 };
  if (ratio === "landscape") return { width: 1600, height: 900 };
  return { width: 1200, height: 1200 };
}

function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value !== "string" && typeof value !== "number") return null;

  const raw = String(value).trim();
  const exact = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (exact) {
    const [, year, month, day] = exact;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function formatChineseDate(date: Date): string {
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${weekdays[date.getDay()]}`;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

async function ensureFolder(app: App, path: string): Promise<void> {
  const parts = normalizePath(path).split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}
