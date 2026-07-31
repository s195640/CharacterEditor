export interface EquipmentItemOptions {
  label: string;
  onToggle: () => void;
}

export interface BodyPartOptions {
  label: string;
  onLengthChange: (value: number) => void;
  onWidthChange: (value: number) => void;
}

export interface ControlPanelOptions {
  animationNames: string[];
  onSelectAnimation: (name: string) => void;
  equipmentItems: EquipmentItemOptions[];
  onExport: () => void;
  onToggleSun: () => void;
  onSizeChange: (value: number) => void;
  bodyParts: BodyPartOptions[];
  onReset: () => void;
  onSpeedChange: (value: number) => void;
  onTogglePause: () => void;
  onStepFrame: (delta: number) => void;
}

export interface ControlPanel {
  setEquipmentState(label: string, equipped: boolean): void;
  setSunState(enabled: boolean): void;
  setPauseState(paused: boolean): void;
  setFrameNumber(frame: number): void;
  resetControls(): void;
}

function createLabeledSlider(
  labelText: string,
  onInput: (value: number) => void,
): { row: HTMLElement; slider: HTMLInputElement } {
  const row = document.createElement("div");
  row.className = "slider-row";

  const label = document.createElement("label");
  label.textContent = labelText;
  row.appendChild(label);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0.5";
  slider.max = "2";
  slider.step = "0.1";
  slider.value = "1";
  slider.addEventListener("input", () => onInput(Number(slider.value)));
  row.appendChild(slider);

  return { row, slider };
}

export function createControlPanel(options: ControlPanelOptions): ControlPanel {
  const panel = document.createElement("div");
  panel.id = "control-panel";

  const resetButton = document.createElement("button");
  resetButton.textContent = "Reset";
  resetButton.addEventListener("click", () => options.onReset());
  panel.appendChild(resetButton);

  const animationsHeading = document.createElement("h2");
  animationsHeading.textContent = "Animations";
  panel.appendChild(animationsHeading);

  for (const name of options.animationNames) {
    const button = document.createElement("button");
    button.textContent = name;
    button.addEventListener("click", () => options.onSelectAnimation(name));
    panel.appendChild(button);
  }

  const speedSlider = createLabeledSlider("Speed", options.onSpeedChange);
  panel.appendChild(speedSlider.row);

  const pauseButton = document.createElement("button");
  pauseButton.addEventListener("click", () => options.onTogglePause());
  panel.appendChild(pauseButton);

  const frameStepRow = document.createElement("div");
  frameStepRow.className = "frame-step-row";
  const prevFrameButton = document.createElement("button");
  prevFrameButton.textContent = "◀ Frame";
  prevFrameButton.addEventListener("click", () => options.onStepFrame(-1));
  frameStepRow.appendChild(prevFrameButton);
  const nextFrameButton = document.createElement("button");
  nextFrameButton.textContent = "Frame ▶";
  nextFrameButton.addEventListener("click", () => options.onStepFrame(1));
  frameStepRow.appendChild(nextFrameButton);
  panel.appendChild(frameStepRow);

  const frameNumberDisplay = document.createElement("div");
  frameNumberDisplay.className = "frame-number-display";
  panel.appendChild(frameNumberDisplay);

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

  const bodyShapeHeading = document.createElement("h2");
  bodyShapeHeading.textContent = "Body Shape";
  panel.appendChild(bodyShapeHeading);

  const bodyPartSliders: { length: HTMLInputElement; width: HTMLInputElement }[] = [];
  for (const part of options.bodyParts) {
    const partLabel = document.createElement("div");
    partLabel.className = "body-part-label";
    partLabel.textContent = part.label;
    panel.appendChild(partLabel);
    const lengthSlider = createLabeledSlider("Length", part.onLengthChange);
    const widthSlider = createLabeledSlider("Width", part.onWidthChange);
    panel.appendChild(lengthSlider.row);
    panel.appendChild(widthSlider.row);
    bodyPartSliders.push({ length: lengthSlider.slider, width: widthSlider.slider });
  }

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

  const setPauseState = (paused: boolean): void => {
    pauseButton.textContent = paused ? "Play" : "Pause";
  };
  setPauseState(false);

  const setFrameNumber = (frame: number): void => {
    frameNumberDisplay.textContent = `Frame: ${frame}`;
  };
  setFrameNumber(0);

  const resetControls = (): void => {
    sizeSlider.value = "1";
    speedSlider.slider.value = "1";
    for (const sliders of bodyPartSliders) {
      sliders.length.value = "1";
      sliders.width.value = "1";
    }
  };

  return { setEquipmentState, setSunState, setPauseState, setFrameNumber, resetControls };
}
