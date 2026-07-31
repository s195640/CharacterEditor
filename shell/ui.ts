export interface ControlPanelOptions {
  animationNames: string[];
  onSelectAnimation: (name: string) => void;
  equipmentLabel: string;
  onToggleEquipment: () => void;
}

export interface ControlPanel {
  setEquipmentState(equipped: boolean): void;
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

  document.body.appendChild(panel);

  const setEquipmentState = (equipped: boolean): void => {
    equipButton.textContent = equipped
      ? `Remove ${options.equipmentLabel}`
      : `Equip ${options.equipmentLabel}`;
  };
  setEquipmentState(false);

  return { setEquipmentState };
}
