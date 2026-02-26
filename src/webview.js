const vscode = acquireVsCodeApi();

let monitoringEnabled = true;
let currentView = "chart";

const state = vscode.getState() || {};
monitoringEnabled = state.monitoringEnabled !== false;

function formatBytes(bytes) {
  if (bytes === 0) {
    return "0";
  }
  const k = 1024;
  const sizes = ["B", "K", "M", "G"];
  let i = Math.floor(Math.log(bytes) / Math.log(k));
  let value = bytes / Math.pow(k, i);

  if (value >= 100 && i < sizes.length - 1) {
    i++;
    value = bytes / Math.pow(k, i);
  }

  let formatted;
  if (value >= 10) {
    formatted = Math.round(value).toString();
  } else {
    formatted = value.toFixed(1);
    if (formatted.endsWith(".0")) {
      formatted = formatted.slice(0, -2);
    }
  }

  return formatted + sizes[i];
}

function updateBar(fillId, valueId, percentage, displayText = null) {
  const fillElement = document.getElementById(fillId);
  const valueElement = document.getElementById(valueId);

  if (fillElement) {
    const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
    fillElement.style.height = clampedPercentage + "%";

    if (clampedPercentage > 80) {
      fillElement.classList.add("high-usage");
    } else {
      fillElement.classList.remove("high-usage");
    }
  }

  if (valueElement && displayText) {
    valueElement.textContent = displayText;
  }
}

function updateText(elementId, text) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text;
  }
}

function showView(viewName) {
  const chartView = document.getElementById("chart-view");
  const settingsView = document.getElementById("settings-view");

  if (viewName === "settings") {
    chartView.style.display = "none";
    settingsView.style.display = "block";
    currentView = "settings";
    loadCurrentSettings();
  } else {
    chartView.style.display = "block";
    settingsView.style.display = "none";
    currentView = "chart";

    setTimeout(() => {
      const container = chartView.querySelector(".chart-container");
      if (container) {
        container.style.display = "flex";
      }
    }, 10);
  }
}

function loadCurrentSettings() {
  vscode.postMessage({
    command: "getCurrentSettings",
  });
}

function applyPausedState(isPaused) {
  const container = document.querySelector(".container");
  if (isPaused) {
    container.classList.add("paused");
  } else {
    container.classList.remove("paused");
  }
}

function handleDataUpdate(message) {
  if (currentView === "settings") {
    return;
  }

  updateBar(
    "cpu-fill",
    "cpu-value",
    message.cpu,
    Math.round(message.cpu) + "%"
  );
  updateText("cpu-percentage", Math.round(message.cpu) + "%");

  updateBar(
    "memory-fill",
    "memory-value",
    message.activeMemoryPercent,
    Math.round(message.activeMemoryPercent) + "%"
  );
  updateText(
    "memory-percentage",
    Math.round(message.activeMemoryPercent) + "%"
  );

  updateBar(
    "vscode-cpu-fill",
    "vscode-cpu-value",
    message.vscodeCpu,
    Math.round(message.vscodeCpu) + "%"
  );
  updateText("vscode-cpu-percentage", Math.round(message.vscodeCpu) + "%");

  updateBar(
    "vscode-memory-fill",
    "vscode-memory-value",
    message.vscodeMemoryPercent,
    message.vscodeMemory + "MB"
  );
  updateText(
    "vscode-memory-percentage",
    Math.round(message.vscodeMemoryPercent) + "%"
  );

  const maxNetworkPercent = Math.max(
    message.networkDownPercent || 0,
    message.networkUpPercent || 0
  );
  const networkDisplay = message.networkDown + "↓\n" + message.networkUp + "↑";
  updateBar(
    "network-fill",
    "network-value",
    Math.min(maxNetworkPercent, 100),
    networkDisplay
  );
  updateText("network-percentage", Math.round(maxNetworkPercent));

  updateText("total-memory", formatBytes(message.totalMemory));
  updateText("used-memory", formatBytes(message.usedMemory));
  updateText("uptime", message.uptime || "--");
}

function handleMonitoringStateUpdate(message) {
  monitoringEnabled = message.enabled;
  const isPaused = message.isPaused;

  updateToggleButton(isPaused);
  updateMonitoringIcon(isPaused);
  applyPausedState(isPaused);

  if (isPaused) {
    clearAllBars();
  }

  vscode.setState({ monitoringEnabled: message.enabled });
}

function updateToggleButton(isPaused) {
  const toggleBtn = document.getElementById("toggle-monitoring");
  const toggleText = document.getElementById("toggle-text");

  if (toggleBtn) {
    if (isPaused) {
      toggleBtn.className = "control-btn paused";
      if (toggleText) {
        toggleText.textContent = "Start";
      }
    } else {
      toggleBtn.className = "control-btn running";
      if (toggleText) {
        toggleText.textContent = "Stop";
      }
    }
  }
}

function updateMonitoringIcon(isPaused) {
  const monitoringIcon = document.getElementById("monitoring-icon");

  if (monitoringIcon) {
    monitoringIcon.textContent = isPaused ? "Start" : "Stop";
  }
}

function clearAllBars() {
  const barIds = [
    "cpu-fill",
    "memory-fill",
    "vscode-cpu-fill",
    "vscode-memory-fill",
    "network-fill",
  ];
  const valueIds = [
    "cpu-value",
    "memory-value",
    "vscode-cpu-value",
    "vscode-memory-value",
    "network-value",
  ];
  const percentageIds = [
    "cpu-percentage",
    "memory-percentage",
    "vscode-cpu-percentage",
    "vscode-memory-percentage",
    "network-percentage",
  ];

  barIds.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.style.height = "0%";
    }
  });

  valueIds.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = "--";
    }
  });

  percentageIds.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = "--";
    }
  });

  updateText("total-memory", "--");
  updateText("used-memory", "--");
  updateText("uptime", "--");
}

window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.command === "updateData") {
    handleDataUpdate(message);
  } else if (message.command === "updateMonitoringState") {
    handleMonitoringStateUpdate(message);
  } else if (message.command === "currentSettings") {
    populateSettingsForm(message.settings);
  }
});

document.addEventListener("DOMContentLoaded", function () {
  const toggleBtn = document.getElementById("toggle-monitoring");
  const settingsBtn = document.getElementById("settings-btn");
  const monitoringIcon = document.getElementById("monitoring-icon");

  if (monitoringIcon) {
    monitoringIcon.textContent = monitoringEnabled ? "Stop" : "Start";
  }
  applyPausedState(!monitoringEnabled);

  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      vscode.postMessage({
        command: "toggleMonitoring",
      });
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", function () {
      if (currentView === "settings") {
        showView("chart");
      } else {
        showView("settings");
      }
    });
  }

  const saveBtn = document.getElementById("save-settings");
  const restoreBtn = document.getElementById("restore-defaults");

  if (saveBtn) {
    saveBtn.addEventListener("click", function () {
      const settings = {
        showCpu: document.getElementById("show-cpu").checked,
        showMemory: document.getElementById("show-memory").checked,
        showVscodeCpu: document.getElementById("show-vscode-cpu").checked,
        showVscodeMemory: document.getElementById("show-vscode-memory").checked,
        showNetwork: document.getElementById("show-network").checked,
        updateInterval: parseInt(
          document.getElementById("update-interval").value
        ),
      };

      vscode.postMessage({
        command: "saveSettings",
        settings: settings,
      });
      
      applyVisibilitySettings(settings);
      
      showView("chart");
    });
  }

  if (restoreBtn) {
    restoreBtn.addEventListener("click", function () {
      vscode.postMessage({
        command: "restoreDefaults",
      });
    });
  }
});

function populateSettingsForm(settings) {
  const showCpu = document.getElementById("show-cpu");
  const showMemory = document.getElementById("show-memory");
  const showVscodeCpu = document.getElementById("show-vscode-cpu");
  const showVscodeMemory = document.getElementById("show-vscode-memory");
  const showNetwork = document.getElementById("show-network");
  const updateInterval = document.getElementById("update-interval");

  if (showCpu) {
    showCpu.checked = settings.showCpu;
  }
  if (showMemory) {
    showMemory.checked = settings.showMemory;
  }
  if (showVscodeCpu) {
    showVscodeCpu.checked = settings.showVscodeCpu;
  }
  if (showVscodeMemory) {
    showVscodeMemory.checked = settings.showVscodeMemory;
  }
  if (showNetwork) {
    showNetwork.checked = settings.showNetwork;
  }
  if (updateInterval) {
    updateInterval.value = settings.updateInterval;
  }
  
  applyVisibilitySettings(settings);
}

function applyVisibilitySettings(settings) {
  const barItems = document.querySelectorAll('.bar-item');
  
  const displaySettings = [
    { bar: barItems[0], show: settings.showCpu },
    { bar: barItems[1], show: settings.showMemory },
    { bar: barItems[2], show: settings.showVscodeCpu },
    { bar: barItems[3], show: settings.showVscodeMemory },
    { bar: barItems[4], show: settings.showNetwork }
  ];
  
  displaySettings.forEach(({ bar, show }) => {
    if (bar) {
      bar.style.display = show ? 'flex' : 'none';
    }
  });
}
