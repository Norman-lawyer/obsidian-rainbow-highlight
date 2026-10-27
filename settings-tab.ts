import {
  App,
  Notice,
  PluginSettingTab,
  type Setting,
  type SettingDefinitionItem,
  type ToggleComponent,
} from "obsidian";
import type RainbowHighlightPlugin from "./main";
import { DEFAULT_SETTINGS, HIGHLIGHT_COLORS } from "./palette";

type DirectSettingKey = "autoOpenPalette" | "popupDelay";

export class RainbowHighlightSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly owner: RainbowHighlightPlugin) {
    super(app, owner);
  }

  getControlValue(key: string): unknown {
    if (key === "autoOpenPalette") return this.owner.settings.autoOpenPalette;
    if (key === "popupDelay") return this.owner.settings.popupDelay;
    return undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "autoOpenPalette" && typeof value === "boolean") {
      await this.owner.updateSettings({ autoOpenPalette: value });
      return;
    }
    if (key === "popupDelay" && typeof value === "number") {
      await this.owner.updateSettings({ popupDelay: value });
    }
  }

  getSettingDefinitions(): SettingDefinitionItem<DirectSettingKey>[] {
    return [
      {
        name: "Rainbow Highlight",
        desc: "Tune the palette without changing existing highlights. 自定义调色盘，不会影响已有高亮。",
        searchable: false,
        render: (setting) => {
          this.containerEl.addClass("rainbow-highlight-settings");
          setting
            .setName("Rainbow Highlight")
            .setDesc(
              "Tune the palette without changing existing highlights. 自定义调色盘，不会影响已有高亮。"
            )
            .setHeading()
            .setClass("rainbow-highlight-settings-header");
        },
      },
      {
        type: "group",
        heading: "Behavior / 交互",
        items: [
          {
            name: "Auto-open palette / 自动打开调色盘",
            desc: "Show the palette after selecting text. 选中文字后自动显示调色盘。",
            control: {
              type: "toggle",
              key: "autoOpenPalette",
            },
          },
          {
            name: "Palette delay / 调色盘延时",
            desc: "A short delay helps complex selections settle. 适当延时可提高复杂选区的稳定性。",
            control: {
              type: "slider",
              key: "popupDelay",
              min: 0,
              max: 200,
              step: 10,
              displayFormat: (value) => `${value} ms`,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Palette colors / 调色盘配色",
        items: [
          {
            name: "About hidden colors / 隐藏配色说明",
            desc: "Hidden colors remain available as commands and existing notes keep their appearance. 隐藏的颜色仍可通过命令使用，也不会改变旧笔记。",
            searchable: false,
          },
          ...HIGHLIGHT_COLORS.map((color) => ({
            name: color.name,
            desc: `${color.class} / ${color.class.replace(/^hl-/, "hlt-")}`,
            render: (setting: Setting) => {
              setting
                .setName(color.name)
                .setDesc(
                  `${color.class} / ${color.class.replace(/^hl-/, "hlt-")}`
                )
                .setClass("rainbow-highlight-color-setting");

              const swatch = setting.nameEl.createSpan({
                cls: "rainbow-highlight-swatch",
                attr: { "aria-hidden": "true" },
              });
              swatch.setCssProps({ "--rainbow-highlight-swatch": color.bg });
              setting.nameEl.prepend(swatch);

              setting.addToggle((toggle: ToggleComponent) => {
                toggle
                  .setValue(
                    this.owner.settings.enabledColorIds.includes(color.id)
                  )
                  .onChange(async (enabled: boolean) => {
                    const current = this.owner.settings.enabledColorIds;
                    if (
                      !enabled &&
                      current.length === 1 &&
                      current.includes(color.id)
                    ) {
                      toggle.setValue(true);
                      new Notice(
                        "Keep at least one palette color. / 请至少保留一种颜色。"
                      );
                      return;
                    }
                    const enabledColorIds = enabled
                      ? [...current, color.id]
                      : current.filter((id) => id !== color.id);
                    await this.owner.updateSettings({ enabledColorIds });
                  });
              });
            },
          })),
        ],
      },
      {
        name: "Reset settings / 恢复默认",
        desc: "Restore all seven colors and the default palette behavior. 恢复 7 种配色和默认交互。",
        render: (setting) => {
          setting
            .setName("Reset settings / 恢复默认")
            .setDesc(
              "Restore all seven colors and the default palette behavior. 恢复 7 种配色和默认交互。"
            )
            .addButton((button) => {
              button.setButtonText("Reset / 重置").onClick(async () => {
                await this.owner.updateSettings({
                  enabledColorIds: [...DEFAULT_SETTINGS.enabledColorIds],
                  autoOpenPalette: DEFAULT_SETTINGS.autoOpenPalette,
                  popupDelay: DEFAULT_SETTINGS.popupDelay,
                });
                this.update();
                new Notice("Settings reset. / 设置已重置。");
              });
            });
        },
      },
    ];
  }
}
