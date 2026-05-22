import type { ParsedLog, AggregatedDevice, DeviceInfo, TestStatus } from "../types";

/**
 * Aggregates a list of parsed log files into a grouped list of unique devices.
 * Logs are matched to the same device if they share the same Serial Number (SN) or MAC address.
 */
export function aggregateReports(reports: ParsedLog[]): AggregatedDevice[] {
  const devices: AggregatedDevice[] = [];

  for (const report of reports) {
    const sn = report.device.sn;
    const mac = report.device.mac;

    // Find all existing aggregated devices that match this report by SN or MAC
    const matchedIndices: number[] = [];
    for (let i = 0; i < devices.length; i++) {
      const dev = devices[i];
      const snMatch = sn && dev.deviceInfo.sn === sn;
      const macMatch = mac && dev.deviceInfo.mac === mac;
      if (snMatch || macMatch) {
        matchedIndices.push(i);
      }
    }

    if (matchedIndices.length === 0) {
      // Create a new aggregated device
      const id = sn || mac || report.source.file_name;
      devices.push({
        id,
        deviceInfo: { ...report.device },
        logs: [report],
        processes: report.processes.map((p) => ({
          ...p,
          logKind: report.source.parser,
          sourceFile: report.source.file_name,
        })),
        anomalies: report.anomalies.map((a) => ({
          ...a,
          sourceFile: report.source.file_name,
        })),
        shmoo_plots: [...report.shmoo_plots],
        overallStatus: "UNKNOWN", // Computed at the end
      });
    } else {
      // Merge into the first matched device
      const primaryIndex = matchedIndices[0];
      const targetDevice = devices[primaryIndex];

      // Merge log info
      targetDevice.logs.push(report);
      targetDevice.processes.push(
        ...report.processes.map((p) => ({
          ...p,
          logKind: report.source.parser,
          sourceFile: report.source.file_name,
        }))
      );
      targetDevice.anomalies.push(
        ...report.anomalies.map((a) => ({
          ...a,
          sourceFile: report.source.file_name,
        }))
      );
      targetDevice.shmoo_plots.push(...report.shmoo_plots);

      // Merge DeviceInfo details
      mergeDeviceInfo(targetDevice.deviceInfo, report.device);

      // If there are other matching devices, merge them into the primary one and remove them
      if (matchedIndices.length > 1) {
        const indicesToRemove = matchedIndices.slice(1).sort((a, b) => b - a); // Sort descending to remove safely
        for (const idx of indicesToRemove) {
          const otherDevice = devices[idx];
          
          targetDevice.logs.push(...otherDevice.logs);
          targetDevice.processes.push(...otherDevice.processes);
          targetDevice.anomalies.push(...otherDevice.anomalies);
          targetDevice.shmoo_plots.push(...otherDevice.shmoo_plots);
          mergeDeviceInfo(targetDevice.deviceInfo, otherDevice.deviceInfo);
          
          // Remove from list
          devices.splice(idx, 1);
        }
      }
    }
  }

  // Final pass: compute overallStatus for each device
  for (const device of devices) {
    device.overallStatus = computeOverallStatus(device.processes.map((p) => p.status));
  }

  return devices;
}

function mergeDeviceInfo(target: DeviceInfo, source: DeviceInfo) {
  if (!target.sn && source.sn) target.sn = source.sn;
  if (!target.mac && source.mac) target.mac = source.mac;
  if (!target.smt_number && source.smt_number) target.smt_number = source.smt_number;
  if (!target.model && source.model) target.model = source.model;
  if (!target.production_date && source.production_date) {
    target.production_date = source.production_date;
  }
}

function computeOverallStatus(statuses: TestStatus[]): TestStatus {
  if (statuses.some((status) => status === "FAIL")) {
    return "FAIL";
  }
  if (statuses.length > 0 && statuses.every((status) => status === "PASS")) {
    return "PASS";
  }
  return "UNKNOWN";
}
