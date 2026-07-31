export interface EquipmentItemOptions {
  label: string;
  onToggle: () => void;
}

export interface ControlPanelOptions {
  animationNames: string[];
  onSelectAnimation: (name: string) => void;
  equipmentItems: EquipmentItemOptions[];
  onExport: () => void;
  onToggleSun: () => void;
  onSizeChange: (value: number) => void;
}

export interface ControlPanel {
  setEquipmentState(label: string, equipped: boolean): void;
  setSunState(enabled: boolean): void;
}

export function createControlPanel(options: ControlPanelOptions): ControlPanel {
  const panel = document.createElement("div");
  panel.id = "control-panel";

  const animationsHeading = document.createElement("h2");
  animationsHeading.textContent = "Animations";
  panel.appendChild(animationsHeading);

  for (const name of options.animationNames) {
    const button = document.createElement("button");
    button.textContent = name;
    button.addEventListener("click", () => options.onSelectAnimation(name));
    panel.appendChild(button);
  }

  const equipmentHeading = document.createElement("h2");
  equipmentHeading.textContent = "Equipment";
  panel.appendChild(equipmentHeading);

  const equipButtons = new Map<string, HTMLButtonElement>();
  for (const item of options.equipmentItems) {
    const button = document.createElement("button");
    button.addEventListener("click", () => item.onToggle());
    panel.appendChild(button);
    equipButtons.set(item.label, button);
  }

  const sizeHeading = document.createElement("h2");
  sizeHeading.textContent = "Size";
  panel.appendChild(sizeHeading);

  const sizeSlider = document.createElement("input");
  sizeSlider.type = "range";
  sizeSlider.min = "0.5";
  sizeSlider.max = "2";
  sizeSlider.step = "0.1";
  sizeSlider.value = "1";
  sizeSlider.addEventListener("input", () => options.onSizeChange(Number(sizeSlider.value)));
  panel.appendChild(sizeSlider);

  const lightingHeading = document.createElement("h2");
  lightingHeading.textContent = "Lighting";
  panel.appendChild(lightingHeading);

  const sunButton = document.createElement("button");
  sunButton.addEventListener("click", () => options.onToggleSun());
  panel.appendChild(sunButton);

  const exportHeading = document.createElement("h2");
  exportHeading.textContent = "Export";
  panel.appendChild(exportHeading);

  const exportButton = document.createElement("button");
  exportButton.textContent = "Export";
  exportButton.addEventListener("click", () => options.onExport());
  panel.appendChild(exportButton);

  document.body.appendChild(panel);

  const setEquipmentState = (label: string, equipped: boolean): void => {
    const button = equipButtons.get(label);
    if (!button) {
      throw new Error(`No equipment button for "${label}"`);
    }
    button.textContent = equipped ? `Remove ${label}` : `Equip ${label}`;
  };
  for (const item of options.equipmentItems) {
    setEquipmentState(item.label, false);
  }

  const setSunState = (enabled: boolean): void => {
    sunButton.textContent = enabled ? "Turn Sun Off" : "Turn Sun On";
  };
  setSunState(true);

  return { setEquipmentState, setSunState };
}
