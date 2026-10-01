/**
 * Base Search Provider Interface
 */

export class BaseSearchProvider {
  /**
   * @param {string} name - Identifier of the provider
   * @param {Object} [config] - Provider configuration
   */
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
  }

  /**
   * Check if this search provider is available / enabled
   * @returns {boolean}
   */
  isAvailable() {
    return true;
  }

  /**
   * Execute search query
   * @param {string} query - Raw search query
   * @param {Object} [options] - Options (limit, recency, signal)
   * @returns {Promise<Array<{title: string, url: string, snippet: string, publisher: string, publishedAt?: string, sourceType?: string}>>}
   */
  async search(query, options = {}) {
    throw new Error(`search() method not implemented in ${this.name}`);
  }
}

export default BaseSearchProvider;
