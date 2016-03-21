(function() {
  'use strict';

  window.FileBehaviors = window.FileBehaviors || {};
  /**
   * Chrome syncable filesystem behavior.
   *
   * @polymerBehavior SyncFilesystemBehavior
   */
  FileBehaviors.SyncFilesystemBehaviorImpl = {
    /**
     * An implementation of requesting filesystem.
     * Other behaviors can override this function to request different type of
     * filesystem.
     *
     * @return {Promise} Fulfilled promise when filesystem has been requested. The filesystem
     * reference is in `fileSystem` attribute.
     */
    _requestFilesystem: function() {
      if (this.fileSystem) {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        chrome.syncFileSystem.requestFileSystem((fileSystem) => {
          if (fileSystem === null) {
            // When a user is not signed into chrome
            reject(chrome.runtime.lastError);
            return;
          }
          this._setFileSystem(fileSystem);
          resolve();
        });
      });
    },
    /**
     * Returns the current usage and quota in bytes for the filesystem.
     *
     * @returns {Promise} Promise will result with filesystem status.
     * Object will contain folowing keys:
     *  - usageBytes (integer)
     *  - quotaBytes (integer)
     */
    getUsageAndQuota: function() {
      this._requestFilesystem()
        .then(() => {
          chrome.syncFileSystem.getUsageAndQuota(this.fileSystem, (info) => {
            this.fire('filesystem-usage', {
              'usageBytes': info.usageBytes,
              'quotaBytes': info.quotaBytes
            });
          });
        })
        .catch((reason) => {
          this.fire('error', {
            'message': reason
          });
        });
    },
    /**
     * Get a file from the storage.
     *
     * Example:
     *  <chrome-app-filesystem id="appFilesystem" file="names.json" syncable="true">
     *  </chrome-app-filesystem>
     *
     *  this.$.fileSystem.getFile().then(function(fileEntry){});
     *
     * @returns {Promise} Fulfilled promise will result with {FileEntry} object.
     */
    getFile: function() {
      return new Promise((resolve, reject) => {
        this._requestFilesystem()
          .then(() => {
            this.fileSystem.root.getFile(this.filename, {
              create: true
            }, function(fileEntry) {
              resolve(fileEntry);
            }, function(reason) {
              reject(reason);
            });
          })
          .catch((reason) => {
            if (reason && reason.message && reason.message.indexOf('error code: -107') > 0) {
              //The user is not signed into the chrome.
              reject(new Error('You must be signed in to the Chrome to use syncable storage'));
              return;
            }
            reject(reason);
          });
      });
    },
    /**
     * List files from root filesystem.
     * A `directory-read` event will be fired when the directory has been read.
     */
    list: function() {
      this._listImpl()
        .catch((reason) => {
          if (reason && reason.message && reason.message.indexOf('error code: -107') > 0) {
            //The user is not signed into the chrome.
            this.fire('error', 'You must be signed in to the Chrome to use syncable storage');
            return;
          }
          this.fire('error', reason);
        });
    }
  };
  window.FileBehaviors.SyncFilesystemBehavior = [
    FileBehaviors.WebFilesystemBehavior,
    FileBehaviors.SyncFilesystemBehaviorImpl
  ];
})();
