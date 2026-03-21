import { renderOperations } from '../flows/operations/index.js';

export async function renderContractsWorkspace(mode = 'registry') {
  if (mode === 'milestones') {
    return renderOperations('contract-milestones');
  }
  return renderOperations('contracts');
}
