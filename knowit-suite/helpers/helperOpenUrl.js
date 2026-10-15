import { getUnlockStep } from '../config.js';

// Open url like page.goto. For a protected page (`unlock` in the URL entry in
// project.config.js) run its unlock step too. Returns the page's response.
export const openUrl = async (page, url) => {
  const response = await page.goto(url);
  const unlock = getUnlockStep(url);
  if (!unlock) {
    return response;
  }
  return (await unlock({ page, url })) ?? response;
};
