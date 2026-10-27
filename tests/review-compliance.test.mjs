import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const versions = JSON.parse(await readFile(new URL("versions.json", root), "utf8"));
const mainSource = await readFile(new URL("main.ts", root), "utf8");
const settingsSource = await readFile(new URL("settings-tab.ts", root), "utf8");
const styles = await readFile(new URL("styles.css", root), "utf8");

test("release metadata agrees on the minimum app version", () => {
  assert.equal(packageJson.version, manifest.version);
  assert.equal(manifest.minAppVersion, "1.13.1");
  assert.equal(versions[manifest.version], manifest.minAppVersion);
});

test("settings use the searchable declarative API", () => {
  assert.match(settingsSource, /getSettingDefinitions\(\)/);
  assert.doesNotMatch(settingsSource, /\bdisplay\(\):\s*void/);
});

test("plugin source uses Obsidian DOM helpers", () => {
  assert.doesNotMatch(mainSource, /document\.createElement/);
  assert.doesNotMatch(settingsSource, /document\.createElement/);
});

test("plugin styles do not rely on important overrides", () => {
  assert.doesNotMatch(styles, /!important/);
});
