// Optional helpers for WordPress sites. The suite itself doesn't depend on
// WordPress; import these in knowit-suite.config.js when the site runs on it.

/**
 * Unlock step for a page protected with a WordPress post password. Use as
 * `unlock` in a URL entry; take the password from .env.
 *
 * @param {string | undefined} password
 * @returns {import('../config.js').UnlockStep}
 */
export const wpPostPassword =
  (password) =>
  async ({ page, url }) => {
    const form = page.locator('form.post-password-form');
    if (!(await form.count())) {
      return null;
    }
    if (!password) {
      throw new Error(`No password set for ${url}. Check .env.`);
    }

    // WordPress saves the password in a cookie and redirects back to the page
    const unlocked = page.waitForResponse(
      (res) => res.url() === url && res.request().isNavigationRequest()
    );
    await form.locator('input[name="post_password"]').fill(password);
    await form.locator('[type="submit"]').click();
    const response = await unlocked;
    // Check only once the new page has loaded; in between the form is gone
    await page.waitForLoadState('load');

    if (await form.count()) {
      throw new Error(`Wrong password for ${url}`);
    }
    return response;
  };
