import WebRequestBodyDetails = chrome.webRequest.WebRequestBodyDetails;

(function () {
    const networkFilters = {
        urls: [
            "*://*/*",
            '<all_urls>'
        ],
        types: ["xmlhttprequest"]
    };

    const extraInfoSpecOnCompleted = [
        "extraHeaders"
    ];
    const tabStorage: any = {};
    const uri2RequestId: any = {};


    chrome.webRequest.onBeforeRequest.addListener((details) => {
        const {tabId, requestId, requestBody, method} = details;
        if (!tabStorage.hasOwnProperty(tabId)) {
            return;
        }
        console.log('sssss', details)
        const urlID = requestIdByUri(details);
        const rBody = parseRequestBody(details);
        uri2RequestId[urlID] = requestId;

        tabStorage[tabId].requests[requestId] = {
            requestId: requestId,
            method: method,
            fullUrl: urlID,
            url: details.url,
            startTime: details.timeStamp,
            status: 'pending',
            reqBody: rBody
        };
    }, networkFilters, ["blocking", "requestBody"]);

    // Read request Headers
    chrome.webRequest.onSendHeaders.addListener((details) => {
        const {tabId, requestId, requestHeaders} = details;
        if (!tabStorage.hasOwnProperty(tabId) || !tabStorage[tabId].requests.hasOwnProperty(requestId)) {
            return;
        }
        const request = tabStorage[tabId].requests[requestId];
        Object.assign(request, {
            endTime: details.timeStamp,
            requestHeaders: requestHeaders,
            status: 'pending'
        });

    }, networkFilters, ['requestHeaders']);



    // Read request Headers
    chrome.webRequest.onResponseStarted.addListener((details) => {
        const {tabId, requestId, responseHeaders} = details;
        if (!tabStorage.hasOwnProperty(tabId) || !tabStorage[tabId].requests.hasOwnProperty(requestId)) {
            return;
        }

        const request = tabStorage[tabId].requests[requestId];
        Object.assign(request, {
            endTime: details.timeStamp,
            responseHeaders: responseHeaders,
            status: 'pending'
        });

    }, networkFilters, ["responseHeaders"]);

    // Read request Headers
    chrome.webRequest.onAuthRequired.addListener((details) => {
        const {tabId, requestId} = details;
        if (!tabStorage.hasOwnProperty(tabId) || !tabStorage[tabId].requests.hasOwnProperty(requestId)) {
            return;
        }

        console.log('onAuthRequired @#$ => ', details)


    }, networkFilters, ["responseHeaders"]);


    chrome.webRequest.onCompleted.addListener((details) => {
        const {tabId, requestId} = details;
        if (!tabStorage.hasOwnProperty(tabId) || !tabStorage[tabId].requests.hasOwnProperty(requestId)) {
            return;
        }
        const request = tabStorage[tabId].requests[requestId];
        Object.assign(request, {
            endTime: details.timeStamp,
            requestDuration: details.timeStamp - request.startTime,
            status: 'complete'
        });
    }, networkFilters, ['extraHeaders']);

    chrome.tabs.onActivated.addListener((tab) => {
        const tabId = tab ? tab.tabId : chrome.tabs.TAB_ID_NONE;
        if (!tabStorage.hasOwnProperty(tabId)) {
            tabStorage[tabId] = {
                id: tabId,
                requests: {},
                registerTime: new Date().getTime()
            };
            chrome.debugger.attach({tabId: tab.tabId}, "1.0");
            chrome.debugger.sendCommand({tabId: tabId}, "Network.enable");
            chrome.debugger.onEvent.addListener(allEventHandler.bind(this));
        }
    });

    chrome.tabs.onRemoved.addListener((tab) => {
        if (!tabStorage.hasOwnProperty(tab.tabId)) {
            return;
        }
        tabStorage[tab.tabId] = null;
        chrome.debugger.detach({tabId: tab.tabId});
    });


    function allEventHandler(debuggeeId, message, params) {
        if (!tabStorage.hasOwnProperty(debuggeeId.tabId)) {
            return;
        }
        if (message == "Network.responseReceived" && params.type === 'XHR' && uri2RequestId[params.response.url]) {

            chrome.debugger.sendCommand({tabId: debuggeeId.tabId}, "Network.getResponseBody", {
                "requestId": params.requestId
            }, function (response) {
                const id = uri2RequestId[params.response.url];
                const request = tabStorage[debuggeeId.tabId].requests[id];
                const payload: any = /*response.base64Encoded ? atob(response.body) : */ response.body;


                Object.assign(request, {
                    responseData: JSON.parse(payload)
                });
                console.log('=========>>>>> ', request);
            });
        }
    }

    function requestIdByUri(details: WebRequestBodyDetails) {
        const {tabId, requestId, requestBody} = details;
        if (requestBody && requestBody.raw) {
            const reqBodyData = decodeURIComponent(String.fromCharCode.apply(null, new Uint8Array(requestBody.raw[0].bytes)));
            return details.url + '#' + reqBodyData;
        }
        return details.url;
    }

    function parseRequestBody(details: WebRequestBodyDetails) {
        const {tabId, requestId, requestBody} = details;
        if (requestBody && requestBody.raw) {
            const reqBodyData = decodeURIComponent(String.fromCharCode.apply(null, new Uint8Array(requestBody.raw[0].bytes)));
            return JSON.parse(reqBodyData)
        }
        return null;
    }
}());
