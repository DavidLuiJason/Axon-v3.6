import { evaluateChatCommand, CommandRouterActions } from '../src/lib/commandRouter';
import { evaluateSettingsCommand } from '../src/lib/chatCapabilityManifest';
import { handleStorageChatCommand, tryEvaluateMathExpression } from '../src/lib/storageChatHandler';
import { DEFAULT_ASSET_MANIFEST } from '../src/lib/storageManifest';
import { ScreenId } from '../src/types';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

// Mock actions
let navigatedScreen: ScreenId | null = null;
let navigationCount = 0;

const mockActions: CommandRouterActions = {
  navigateTo: (screen: ScreenId, options?: any) => {
    navigatedScreen = screen;
    navigationCount++;
  },
};

function resetMock() {
  navigatedScreen = null;
  navigationCount = 0;
}

console.log('====================================================');
console.log('RUNNING AXON COMMAND ROUTER VERIFICATION SUITE');
console.log('====================================================\n');

// Test 1: /open settings
resetMock();
const res1 = evaluateChatCommand('/open settings', mockActions, 'axon');
const pass1 = res1.handled === true && res1.executed === true && navigatedScreen === 'settings';
results.push({
  name: 'Test 1: "/open settings"',
  passed: pass1,
  details: `handled: ${res1.handled}, executed: ${res1.executed}, navigatedScreen: ${navigatedScreen}, response: "${res1.response}"`,
});

// Test 2: /open tools
resetMock();
const res2 = evaluateChatCommand('/open tools', mockActions, 'axon');
const pass2 = res2.handled === true && res2.executed === true && navigatedScreen === 'tools';
results.push({
  name: 'Test 2: "/open tools"',
  passed: pass2,
  details: `handled: ${res2.handled}, executed: ${res2.executed}, navigatedScreen: ${navigatedScreen}, response: "${res2.response}"`,
});

// Test 3: /open code
resetMock();
const res3 = evaluateChatCommand('/open code', mockActions, 'axon');
const pass3 = res3.handled === true && res3.executed === true && navigatedScreen === 'code';
results.push({
  name: 'Test 3: "/open code"',
  passed: pass3,
  details: `handled: ${res3.handled}, executed: ${res3.executed}, navigatedScreen: ${navigatedScreen}, response: "${res3.response}"`,
});

// Test 4: /open with no target
resetMock();
const res4 = evaluateChatCommand('/open', mockActions, 'axon');
const pass4 = res4.handled === true && res4.executed === false && navigatedScreen === null;
results.push({
  name: 'Test 4: "/open" (no target)',
  passed: pass4,
  details: `handled: ${res4.handled}, executed: ${res4.executed}, navigatedScreen: ${navigatedScreen} (no navigation), response: "${res4.response.slice(0, 45)}..."`,
});

// Test 5: /open with an invalid target
resetMock();
const res5 = evaluateChatCommand('/open nonexistent_screen_xyz123', mockActions, 'axon');
const pass5 = res5.handled === true && res5.executed === false && navigatedScreen === null;
results.push({
  name: 'Test 5: "/open" (invalid target)',
  passed: pass5,
  details: `handled: ${res5.handled}, executed: ${res5.executed}, navigatedScreen: ${navigatedScreen} (no navigation), response: "${res5.response.slice(0, 50)}..."`,
});

// Test 6: Normal conversational message containing "open"
resetMock();
const convMsg1 = 'Can we open a new topic on quantum mechanics?';
const res6a = evaluateChatCommand(convMsg1, mockActions, 'axon');
const convMsg2 = 'I want to open a file and inspect its contents';
const res6b = evaluateChatCommand(convMsg2, mockActions, 'axon');
const convMsg3 = 'open-ended questions are great for brainstorming';
const res6c = evaluateChatCommand(convMsg3, mockActions, 'axon');
const convMsg4 = 'open a discussion about neural networks';
const res6d = evaluateChatCommand(convMsg4, mockActions, 'axon');

const pass6 =
  res6a.handled === false &&
  res6b.handled === false &&
  res6c.handled === false &&
  res6d.handled === false &&
  navigatedScreen === null;

results.push({
  name: 'Test 6: Conversational message containing "open"',
  passed: pass6,
  details: `All 4 conversational queries returned handled: false and did not trigger navigation.`,
});

// Test 6.5: Natural language navigation: "open settings" and "go to tools"
resetMock();
const resNL1 = evaluateChatCommand('open settings', mockActions, 'axon');
const passNL1 = resNL1.handled === true && resNL1.executed === true && navigatedScreen === 'settings';

resetMock();
const resNL2 = evaluateChatCommand('go to tools', mockActions, 'axon');
const passNL2 = resNL2.handled === true && resNL2.executed === true && navigatedScreen === 'tools';

results.push({
  name: 'Test 6b: Natural language navigation ("open settings", "go to tools")',
  passed: passNL1 && passNL2,
  details: `"open settings" -> screen: ${resNL1.targetScreen}, "go to tools" -> screen: ${resNL2.targetScreen}`,
});

// Test 7: Verify existing command waterfall is NOT broken
// 7a: Settings command (e.g. "switch to dark")
resetMock();
const cmdRouterForDark = evaluateChatCommand('switch to dark', mockActions, 'axon');
let themeModeSet = '';
const settingsRes = evaluateSettingsCommand('switch to dark', {
  theme: { mode: 'light', accentColor: '#3B82F6', functionColors: {} as any },
  setThemeMode: (mode) => {
    themeModeSet = mode;
  },
  setAccentColor: () => {},
  setFunctionColor: () => {},
  resetThemeToDefault: () => {},
  icons: {} as any,
  setAppIconPreset: () => {},
  setAvatarPreset: () => {},
  setAppNameTextCase: () => {},
  codeSkillLevel: 'standard',
  setCodeSkillLevel: () => {},
  workspaceCodeLoadMode: 'manual',
  setWorkspaceCodeLoadMode: () => {},
  soundEnabled: true,
  setSoundEnabled: () => {},
  notificationsEnabled: true,
  setNotificationsEnabled: () => {},
});

// 7b: Storage command
const cmdRouterForStorage = evaluateChatCommand('how much storage do I have left', mockActions, 'axon');
let storageReallocated = false;
let packAdded = false;
const storageRes = handleStorageChatCommand(
  'how much storage do I have left',
  DEFAULT_ASSET_MANIFEST,
  (assetId: string, bytesToFree: number) => {
    storageReallocated = true;
    return { success: true, message: 'Reallocated space' };
  },
  () => {
    packAdded = true;
  }
);

// 7c: Math expression
const cmdRouterForMath = evaluateChatCommand('15 * 8', mockActions, 'axon');
const mathRes = tryEvaluateMathExpression('15 * 8');

const pass7 =
  cmdRouterForDark.handled === false && // Command router does not intercept settings command
  settingsRes.handled === true &&
  settingsRes.executed === true &&
  themeModeSet === 'dark' &&
  cmdRouterForStorage.handled === false && // Command router does not intercept storage command
  storageRes !== null &&
  storageRes.includes('Storage Manifest Report') &&
  cmdRouterForMath.handled === false && // Command router does not intercept math
  mathRes === '15 * 8 = 120';

results.push({
  name: 'Test 7: Existing command waterfall non-interference (Settings, Storage, Math)',
  passed: pass7,
  details: `Settings command handled: ${settingsRes.handled} (theme: ${themeModeSet}), Storage command handled: ${storageRes !== null}, Math handled: ${mathRes === '15 * 8 = 120'}`,
});

// Print summary
console.log('RESULTS:\n');
let allPassed = true;
for (const r of results) {
  const mark = r.passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${mark} - ${r.name}`);
  console.log(`       ${r.details}`);
  if (!r.passed) allPassed = false;
}

console.log('\n====================================================');
console.log(`OVERALL: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
console.log('====================================================');

if (!allPassed) {
  process.exit(1);
}
