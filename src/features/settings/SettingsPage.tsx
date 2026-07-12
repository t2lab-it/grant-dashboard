import { AppearanceSettingsSection } from "./AppearanceSettingsSection";
import { ClassificationSettingsSection } from "./ClassificationSettingsSection";
import { DefaultInputSettingsSection } from "./DefaultInputSettingsSection";
import { DisplaySettingsSection } from "./DisplaySettingsSection";

export function SettingsPage() {
  return (
    <section className="settings-page">
      <h2>設定</h2>
      <ClassificationSettingsSection />
      <DefaultInputSettingsSection />
      <DisplaySettingsSection />
      <AppearanceSettingsSection />
    </section>
  );
}
