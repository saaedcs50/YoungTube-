/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-970124e6'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "0f280f52a3d2277aba79fb1f42651536"
  }, {
    "url": "pwa-512x512.png",
    "revision": "0f280f52a3d2277aba79fb1f42651536"
  }, {
    "url": "pwa-192x192.png",
    "revision": "fab41d56ab9f44a8611e088c2d891592"
  }, {
    "url": "og-image.png",
    "revision": "a28b0cfb28569a76a72f7432ccf22403"
  }, {
    "url": "index.html",
    "revision": "7f223bbd04d36adca1232bf8abd46aff"
  }, {
    "url": "icon.svg",
    "revision": "a369c0f27465a27aafb9aaacad116718"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "3e74e084dcd35492412a72b247017e6d"
  }, {
    "url": "fonts/cairo-900.woff2",
    "revision": "b34585d26b8d60aa53d3b4ddadce74d8"
  }, {
    "url": "fonts/cairo-800.woff2",
    "revision": "9a551df16ccbc31f2df41ceb34c02881"
  }, {
    "url": "fonts/cairo-700.woff2",
    "revision": "2ee9fa708606728e5ad5fd62c487557a"
  }, {
    "url": "fonts/cairo-600.woff2",
    "revision": "8744448544b1538b0dbf34c0921ea6aa"
  }, {
    "url": "fonts/cairo-500.woff2",
    "revision": "8e4929526f5fe83ae849f010082f6412"
  }, {
    "url": "fonts/cairo-400.woff2",
    "revision": "07d5c872f7b7f939dc3362a6e9d05e13"
  }, {
    "url": "assets/workbox-window.prod.es5-BBnX5xw4.js",
    "revision": null
  }, {
    "url": "assets/user-CDrk-K0a.js",
    "revision": null
  }, {
    "url": "assets/smartphone-EU0AvTKe.js",
    "revision": null
  }, {
    "url": "assets/sliders-vertical-Ha6xCyHl.js",
    "revision": null
  }, {
    "url": "assets/shield-check-CxyNVib4.js",
    "revision": null
  }, {
    "url": "assets/shield-alert-Cxq0sK11.js",
    "revision": null
  }, {
    "url": "assets/rotate-ccw-Bp798isV.js",
    "revision": null
  }, {
    "url": "assets/plus--Mb-2Mut.js",
    "revision": null
  }, {
    "url": "assets/moon-BfRqOCp4.js",
    "revision": null
  }, {
    "url": "assets/layers-CL_hAo9f.js",
    "revision": null
  }, {
    "url": "assets/info-CWGYiorc.js",
    "revision": null
  }, {
    "url": "assets/index-DzlJWdf2.js",
    "revision": null
  }, {
    "url": "assets/index-CTKQijvg.css",
    "revision": null
  }, {
    "url": "assets/funnelTelemetry-BME-gUmp.js",
    "revision": null
  }, {
    "url": "assets/fast-forward-DbJjyerc.js",
    "revision": null
  }, {
    "url": "assets/external-link-MYmn0ITH.js",
    "revision": null
  }, {
    "url": "assets/clock-r2EHzXjO.js",
    "revision": null
  }, {
    "url": "assets/check-BYVwwzrc.js",
    "revision": null
  }, {
    "url": "assets/bookmark-C_pnc5iu.js",
    "revision": null
  }, {
    "url": "assets/arrow-left-D7UfHWuC.js",
    "revision": null
  }, {
    "url": "assets/WelcomeValueScreen-D0S_NStk.js",
    "revision": null
  }, {
    "url": "assets/TimerTestCard-DqObeuq_.js",
    "revision": null
  }, {
    "url": "assets/TimerSection-47g3-KP1.js",
    "revision": null
  }, {
    "url": "assets/TasteShiftCard-MtE0T33w.js",
    "revision": null
  }, {
    "url": "assets/SessionEndScreen-DhmuWslw.js",
    "revision": null
  }, {
    "url": "assets/SavedVideosTab-DzDiIMeF.js",
    "revision": null
  }, {
    "url": "assets/PostSetupChecklist-CYBepeKu.js",
    "revision": null
  }, {
    "url": "assets/PlayerView-CeW61sr6.js",
    "revision": null
  }, {
    "url": "assets/PinOtpInput-Bf4nYPSy.js",
    "revision": null
  }, {
    "url": "assets/PinLockModal-LNDsMBZ3.js",
    "revision": null
  }, {
    "url": "assets/Onboarding-BTwNR9hT.js",
    "revision": null
  }, {
    "url": "assets/FilteringTab-CBmgk-Vb.js",
    "revision": null
  }, {
    "url": "assets/FilteringResultCard-BtFqXgJt.js",
    "revision": null
  }, {
    "url": "assets/DashboardShell-CgyEBZpV.js",
    "revision": null
  }, {
    "url": "assets/ChildProfileSection-CCbqyTof.js",
    "revision": null
  }, {
    "url": "assets/ChannelsCountCard-C7omBKV2.js",
    "revision": null
  }, {
    "url": "assets/ChannelCurationByCategory-s_JZMshh.js",
    "revision": null
  }, {
    "url": "assets/AnnouncementModal-BjonTrkD.js",
    "revision": null
  }, {
    "url": "assets/AddByUrlCard-Bm5wAv5y.js",
    "revision": null
  }, {
    "url": "assets/AdBlockNotice-u1rrdFdh.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "3e74e084dcd35492412a72b247017e6d"
  }, {
    "url": "icon.svg",
    "revision": "a369c0f27465a27aafb9aaacad116718"
  }, {
    "url": "pwa-192x192.png",
    "revision": "fab41d56ab9f44a8611e088c2d891592"
  }, {
    "url": "pwa-512x512.png",
    "revision": "0f280f52a3d2277aba79fb1f42651536"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "0f280f52a3d2277aba79fb1f42651536"
  }, {
    "url": "manifest.webmanifest",
    "revision": "b0350eac813ba8d34ee9121b23bbce14"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/.*\.workers\.dev\/(api\/|channels-latest).*/i, new workbox.NetworkFirst({
    "cacheName": "worker-api-cache",
    "networkTimeoutSeconds": 3,
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 86400
    }), new workbox.CacheableResponsePlugin({
      statuses: [200]
    })]
  }), 'GET');

}));
