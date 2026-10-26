import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type RainbowHighlightPlugin from "./main";
import { DEFAULT_SETTINGS, HIGHLIGHT_COLORS } from "./palette";

export class RainbowHighlightSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly owner: RainbowHighlightPlugin) {
    super(app, owner);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("rainbow-highlight-settings");

    containerEl.createEl("h2", {
      text: "Rainbow Highlight",
      cls: "rainbow-highlight-settings-header",
    });
    containerEl.createEl("p", {
      text: "Tune the palette without changing existing highlights. 自定义调色盘，不会影响已有高亮。",
      cls: "rainbow-highlight-setting-intro",
    });

    new Setting(containerEl).setName("Behavior / 交互").setHeading();

    new Setting(containerEl)
      .setName("Auto-open palette / 自动打开调色盘")
      .setDesc("Show the palette after selecting text. 选中文字后自动显示调色盘。")
      .addToggle((toggle) => {
        toggle
          .setValue(this.owner.settings.autoOpenPalette)
          .onChange(async (value) => {
            await this.owner.updateSettings({ autoOpenPalette: value });
          });
      });

    new Setting(containerEl)
      .setName("Palette delay / 调色盘延时")
      .setDesc("A short delay helps complex selections settle. 适当延时可提高复杂选区的稳定性。")
      .addSlider((slider) => {
        slider
          .setLimits(0, 200, 10)
          .setValue(this.owner.settings.popupDelay)
          .setDisplayFormat((value) => `${value} ms`)
          .onChange(async (value) => {
            await this.owner.updateSettings({ popupDelay: value });
          });
      });

    new Setting(containerEl).setName("Palette colors / 调色盘配色").setHeading();
    containerEl.createEl("p", {
      text: "Hidden colors remain available as commands and existing notes keep their appearance. 隐藏的颜色仍可通过命令使用，也不会改变旧笔记。",
      cls: "setting-item-description rainbow-highlight-palette-note",
    });

    HIGHLIGHT_COLORS.forEach((color) => {
      const setting = new Setting(containerEl)
        .setName(color.name)
        .setDesc(`${color.class} / ${color.class.replace(/^hl-/, "hlt-")}`)
        .setClass("rainbow-highlight-color-setting");
      const swatch = document.createElement("span");
      swatch.addClass("rainbow-highlight-swatch");
      swatch.style.setProperty("--rainbow-highlight-swatch", color.bg);
      swatch.setAttribute("aria-hidden", "true");
      setting.nameEl.prepend(swatch);

      setting.addToggle((toggle) => {
        toggle
          .setValue(this.owner.settings.enabledColorIds.includes(color.id))
          .onChange(async (enabled) => {
            const current = this.owner.settings.enabledColorIds;
            if (!enabled && current.length === 1 && current.includes(color.id)) {
              toggle.setValue(true);
              new Notice("Rainbow Highlight: keep at least one palette color. / 请至少保留一种颜色。");
              return;
            }
            const enabledColorIds = enabled
              ? [...current, color.id]
              : current.filter((id) => id !== color.id);
            await this.owner.updateSettings({ enabledColorIds });
          });
      });
    });

    new Setting(containerEl)
      .setName("Reset settings / 恢复默认")
      .setDesc("Restore all seven colors and the default palette behavior. 恢复 7 种配色和默认交互。")
      .addButton((button) => {
        button.setButtonText("Reset / 重置").onClick(async () => {
          await this.owner.updateSettings({
            enabledColorIds: [...DEFAULT_SETTINGS.enabledColorIds],
            autoOpenPalette: DEFAULT_SETTINGS.autoOpenPalette,
            popupDelay: DEFAULT_SETTINGS.popupDelay,
          });
          this.display();
          new Notice("Rainbow Highlight: settings reset. / 设置已重置。");
        });
      });
  }
}
