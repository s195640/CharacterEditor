export interface ControlPanelOptions {
  animationNames: string[];
  onSelectAnimation: (name: string) => void;
  equipmentLabel: string;
  onToggleEquipment: () => void;
  onExport: () => void;
  onToggleSun: () => void;
}

export interface ControlPanel {
  setEquipmentState(equipped: boolean): void;
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

  const equipButton = document.createElement("button");
  equipButton.addEventListener("click", () => options.onToggleEquipment());
  panel.appendChild(equipButton);

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

  const setEquipmentState = (equipped: boolean): void => {
    equipButton.textContent = equipped
      ? `Remove ${options.equipmentLabel}`
      : `Equip ${options.equipmentLabel}`;
  };
  setEquipmentState(false);

  const setSunState = (enabled: boolean): void => {
    sunButton.textContent = enabled ? "Turn Sun Off" : "Turn Sun On";
  };
  setSunState(true);

  return { setEquipmentState, setSunState };
}
