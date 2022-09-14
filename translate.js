'use strict';

let translate = (function () {

  let trans = {};

  function formatSeconds(seconds) {
    if(typeof seconds == 'number'){ 
      return new Date(seconds.toFixed(3) * 1000).toISOString().substr(11, 12);
    } else {
      //console.log("warning - attempting to format the non number: "+seconds);
      return null;
    }
  }

  trans.init = function(transcriptId, maxLength, minLength, sentences, translation) {
    let transcript = document.getElementById(transcriptId);
    let words = transcript.querySelectorAll('[data-m]');
    let data = {};
    data.segments = [];
    let segmentIndex = 0;

    class segmentMeta {
      constructor(speaker, start, duration, chars) {
        this.speaker = speaker;
        this.start = start;
        this.duration = duration;
        this.chars = chars;
        this.words = [];
      }
    }

    class wordMeta {
      constructor(start, duration, text) {
        this.start = start;
        this.duration = duration;
        this.text = text;
      }
    }

    let thisWordMeta;
    let thisSegmentMeta = null;

    // defaults
    let maxLineLength = 37;
    let minLineLength = 21;

    let captionsVtt = "WEBVTT\n"

    //let endSentenceDelimiter = /[\.。?؟!]/g;
    let endSentenceDelimiter = /[\.。?!]/g;
    let midSentenceDelimiter = /[,、–，،و:，…‥]/g;

    if (!isNaN(maxLength)) {
      maxLineLength = maxLength;
    }

    if (!isNaN(minLength)) {
      minLineLength = minLength;
    }
    
    let transSentences = [];
    
    let sentence = "";
    //let sentences = [];
    let sentenceIndex = 0;

    //console.log(sentences);
    //console.log(translation);

    transSentences = translation;
  
    
    // segments are objects representing discreet parts of the transcript - all segments have one speaker and represent one sentence or partial sentence spoken by the speaker (before a speaker change)
    
    words.forEach(function(word, i) {

      if (thisSegmentMeta === null) {
        // create segment meta object
        thisSegmentMeta = new segmentMeta("", null, 0, 0, 0);
      }

      if (word.classList.contains("speaker")) {

        // checking that this is not a new segment AND a new empty segment wasn't already created
        if (thisSegmentMeta !== null && thisSegmentMeta.start !== null) { 
          data.segments.push(thisSegmentMeta); // push the previous segment because it's a new speaker
          thisSegmentMeta = new segmentMeta("", null, 0, 0, 0);
        }

        thisSegmentMeta.speaker = word.innerText;

      } else {

        let thisStart = parseInt(word.getAttribute("data-m"))/1000;
        let thisDuration = parseInt(word.getAttribute("data-d"))/1000;

        if (isNaN(thisStart)) {
          thisStart = 0;
        }
        
        if (isNaN(thisDuration)) {
          thisDuration = 0;
        }

        let thisText = word.innerText;

        thisWordMeta = new wordMeta(thisStart, thisDuration, thisText);
        
        if (thisSegmentMeta.start === null) { 
          thisSegmentMeta.start = thisStart;
          thisSegmentMeta.duration = 0;
          thisSegmentMeta.chars = 0;
        }

        thisSegmentMeta.duration += thisDuration;
        thisSegmentMeta.chars += thisText.length;

        thisSegmentMeta.words.push(thisWordMeta);

        // remove spaces first just in case
        let lastChar = thisText.replace(/\s/g, '').slice(-1);
        if (lastChar.match(endSentenceDelimiter)) {
          data.segments.push(thisSegmentMeta);
          thisSegmentMeta = null;
        }
      }
    });

    //console.log(data.segments);

    class captionMeta {
      constructor(start, stop, text) {
        this.start = start;
        this.stop = stop;
        this.text = text;
      }
    }

    let captions = [];
    let thisCaption = null;


    data.segments.map(function(segment) {

      // If the entire segment fits on a line, add it to the captions.
      if (segment.chars < maxLineLength) {

        thisCaption = new captionMeta(formatSeconds(segment.start), formatSeconds(segment.start + segment.duration), "");
        
        segment.words.forEach(function(wordMeta) {
          thisCaption.text += wordMeta.text;
        });

        thisCaption.text += "\n";
        captions.push(thisCaption);
        thisCaption = null;

      } else { // The number of chars in this segment is longer than our single line maximum

        let charCount = 0;
        let lineText = "";
        let firstLine = true;
        let lastOutTime;
        let lastInTime = null;
        
        segment.words.forEach(function(wordMeta, index) {

          let lastChar = wordMeta.text.replace(/\s/g, '').slice(-1);

          if (lastInTime === null) { // if it doesn't exist yet set the caption start time to the word's start time.
            lastInTime = wordMeta.start;
          }

          // Are we over the minimum length of a line and hitting a good place to split mid-sentence?
          if (charCount + wordMeta.text.length > minLineLength && lastChar.match(midSentenceDelimiter)) {

            if (firstLine === true) {

              thisCaption = new captionMeta(formatSeconds(lastInTime), formatSeconds(wordMeta.start + wordMeta.duration), "");
              thisCaption.text += lineText + wordMeta.text + "\n"; 
              
              //check for last word in segment, if it is we can push a one line caption, if not – move on to second line

              if (index + 1 >= segment.words.length) {
                captions.push(thisCaption);
                thisCaption = null;
              } else {
                firstLine = false;
              }

            } else { // We're on the second line ... we're over the minimum chars and in a good place to split – let's push the caption

              thisCaption.stop = formatSeconds(wordMeta.start + wordMeta.duration);
              thisCaption.text += lineText + wordMeta.text + "\n";
              captions.push(thisCaption);
              thisCaption = null;
              firstLine = true;
            }

            // whether first line or not we should reset ready for a new caption
            charCount = 0;
            lineText = "";
            lastInTime = null; 

          } else { // we're not over the minimum length with a suitable splitting point

            // If we add this word are we over the maximum?
            if (charCount + wordMeta.text.length > maxLineLength) {

              if (firstLine === true) {

                if (lastOutTime === undefined) {
                  lastOutTime = wordMeta.start + wordMeta.duration;
                }

                thisCaption = new captionMeta(formatSeconds(lastInTime), formatSeconds(lastOutTime), "");
                thisCaption.text += lineText + "\n";

                // It's just the first line so we should only push a new caption if it's the very last word!

                if (index >= segment.words.length) {
                  captions.push(thisCaption);
                  thisCaption = null;
                } else {
                  firstLine = false;
                }

              } else { // We're on the second line and since we're over the maximum with the next word we should push this caption!

                thisCaption.stop = formatSeconds(lastOutTime);
                thisCaption.text += lineText + "\n";
 
                captions.push(thisCaption);

                thisCaption = null;
                firstLine = true;
              }

              // do the stuff we need to do to start a new line
              charCount = wordMeta.text.length; 
              lineText = wordMeta.text;
              lastInTime = wordMeta.start; 

            } else { // We're not over the maximum with this word, update the line length and add the word to the text

              charCount += wordMeta.text.length;
              lineText += wordMeta.text;

            }
          }

          // for every word update the lastOutTime
          lastOutTime = wordMeta.start + wordMeta.duration;
        });
        
        // we're out of words for this segment - decision time!
        if (thisCaption !== null) { // The caption had been started, time to add whatever text we have and add a stop point
          thisCaption.stop = formatSeconds(lastOutTime);
          thisCaption.text += lineText + "\n";
          captions.push(thisCaption);
          thisCaption = null;
          
        } else { // caption hadn't been started yet - create one!
          if (lastInTime !== null) { 
            thisCaption = new captionMeta(formatSeconds(lastInTime), formatSeconds(lastOutTime), lineText);
            captions.push(thisCaption);
            thisCaption = null;  
          }
        }
      }
    });

    /* =============================================== */

    //console.log(captions);

    function stringsIntersect(string1, string2) {

      string1 = string1.trim();
      string2 = string2.trim();

      //console.log("checking intersection for ...");

      //console.log(string1);
      //console.log(string2);

      if (string1 === string2) {
        //console.log("sentence is *equal* to caption");
        return 1;
      }

      if (string1.indexOf(string2) >= 0) {
        //console.log("caption is larger than sentence");
        return string2.length / string1.length;
      }

      if (string2.indexOf(string1) >= 0) {
        //console.log("sentence is larger than caption");
        return string2.length / string1.length;
      }

      for (let i = 1; i < string1.length; i++) {
        
        if (string2.indexOf(string1.substr(i)) >= 0) {
          //console.log("partial caption in sentence");
          return string1.substr(i).length / string2.length;
        }
      }

      for (let i = 1; i < string2.length; i++) {
        if (string1.indexOf(string2.substr(i)) >= 0) {
          //console.log("partial sentence in caption");
          return string2.substr(i).length / string1.length;
        }
      }

      return "";
    }

    // This split includes the character used to split in the result
    function inclusiveSplit(str, char) {
      let splitArray = str.split(char);
      let index = -1;

      splitArray.forEach(function(word, i) {
        index += word.length + 1;
        splitArray[i] += str.charAt(index);
      });
      return splitArray;
    }

    function insertLineBreak(str) {
      let newStr = "";
      let split = false;
      str = str.trim();
      if (str.length > maxLineLength) {
        let words = str.split(" ");
        words.forEach(function(word){
          if ((newStr + word).length > maxLineLength && split === false) {
            newStr += "\n";
            split = true;
          }
          newStr += word + " ";
        });
        return newStr.trim();
      } else {
        return str;
      }
    }

    let transCaptionsVtt = "";

    sentenceIndex = 0;
    let remainingSentence = null;
    let remainingTransSentence = null;
    let thisTransCaption = null;
    let transCaptionArr = [];

    captions.forEach(function(caption, c) {

      let textToCheck = ""; 
      if (caption.stop !== "00:00:00.000") {

        //console.log("==========================================");
        //console.log("              new caption "+c);
        //console.log("==========================================");
        
        captionsVtt += "\n" + caption.start + "-->" + caption.stop + "\n" + caption.text + "\n";
        //console.log(caption.start + "-->" + caption.stop + "\n" + caption.text + "\n");

        let captionText = caption.text.replace(/(\r\n|\n|\r)/gm, ""); // remove line break
        textToCheck += captionText;

        let matchTolerance = 0.4; // change the way this works!

        let thisSentence = null;
        let thisTransSentence = null;

        //console.log("sentenceIndex = "+sentenceIndex);

        for (let i = sentenceIndex; i < sentences.length; i++) {

          if (remainingSentence !== null) {
            thisSentence = remainingSentence;
          } else {
            thisSentence = sentences[i];
          }

          if (remainingTransSentence !== null && remainingTransSentence !== undefined) {
            thisTransSentence = remainingTransSentence;
          } else {
            thisTransSentence = transSentences[i];
          }

          let intersection = stringsIntersect(captionText, thisSentence);
          //console.log("------------");
          //console.log("intersection");
          //console.log(intersection);
          //console.log("to be a match it should be > "+(1 - matchTolerance));
    
          
          if ((intersection > (1 - matchTolerance))) { // looks like a match
            //console.log(captionText);
            //console.log(thisSentence);
            //console.log("Match!!!");
            // we found a match now let's see what part of the next sentence fits in the caption

            if (intersection === 1){ // exact match - sentence matches caption


              thisTransCaption = new captionMeta(caption.start, caption.stop, thisTransSentence);
              transCaptionArr.push(thisTransCaption);

              //console.log("-----{}{}{}{}{}{}-----");
              //console.log("case 1 ...");
              //console.log(caption.start + "-->" + caption.stop + "\n" + thisTransSentence);
              transCaptionsVtt += "\n" + caption.start + "-->" + caption.stop + "\n" + insertLineBreak(thisTransSentence) + "\n";
              
              remainingSentence = null;
              remainingTransSentence = null;
              sentenceIndex++;
              
            } else if (intersection < 1) { // sentence is smaller than caption
              // add this sentence to vtt output and figure out how much of following sentences to add
              let captionSentence = thisTransSentence;
              
              //console.log("check remaining string with next sentence");
              intersection = stringsIntersect(captionText.replace(thisSentence,""), sentences[i+1]);
              //console.log("next sentence intersection with text remaining in caption "+captionText.replace(thisSentence,""));
              //console.log(sentences[i+1]);
              //console.log("next intersection");
              //console.log(intersection);

              if (intersection === 1){ // exact match - next sentence matches remains of caption
                captionSentence += transSentences[i+1];

                thisTransCaption = new captionMeta(caption.start, caption.stop, captionSentence);
                transCaptionArr.push(thisTransCaption);
                //console.log("-----{}{}{}{}{}{}-----");
                //console.log("case 2 ...");
                //console.log(caption.start + "-->" + caption.stop + "\n" + captionSentence);
                transCaptionsVtt += "\n" + caption.start + "-->" + caption.stop + "\n" + insertLineBreak(captionSentence) + "\n";
              } else if (intersection < 1) { // sentence is smaller than remaining caption
                captionSentence += transSentences[i+1];
                intersection = stringsIntersect(captionText.replace(sentence[i+1],""), sentences[i+2]);
              } else if (intersection > 1) { // sentence is larger than remaining caption
                //console.log("sentence is larger than remaining caption...");
              }

              remainingSentence = null;
              remainingTransSentence = null;
              sentenceIndex++;

            } else if (intersection > 1) {// sentence is larger than caption
              
              //console.log("sentence is larger than caption");
              // figure out where to split sentence
              // first see if splitting by mid-sentence delimiters give us the same number of splits in both languages
              let sentenceSplit; 
              let transSentenceSplit; 

              //console.log("<== spliting sentences into smaller chunks ===>");
              sentenceSplit = inclusiveSplit(thisSentence, midSentenceDelimiter);
              transSentenceSplit = inclusiveSplit(thisTransSentence, midSentenceDelimiter);
 
              let testSentence = "";
              let fitSentence = "";
              let fitTransSentence = "";
              let chunkIndex = 0; // should this be null or -1 initially?

              if (sentenceSplit.length === transSentenceSplit.length) {
                // figure out where original sentence split
                //console.log("same number of sentence chunks...");

                sentenceSplit.forEach(function(chunk, i) {
                  testSentence += chunk;
                  if (captionText.indexOf(testSentence.trim()) >= 0) {
                    fitSentence = testSentence;
                    fitTransSentence += transSentenceSplit[chunkIndex];
                    chunkIndex++;
                  }
                });
  
                //console.log("part of sentence that fits = "+ fitSentence);
                //console.log("chunk index = "+ chunkIndex);
              }

              let captionSentence = "";

              if (chunkIndex > 0) {// found a matching chunk(s) (greater than zero because chunKindex gets imcremented)

                // build up equivalent from translated sentence
                for (let i=0; i < chunkIndex; i++) {
                  captionSentence += transSentenceSplit[i];
                }
                
                //console.log("testSentence = "+testSentence);
                //console.log("fitSentence = "+fitSentence);
                //console.log("captionText = "+captionText);

                // trim() removes whitespace from both ends of a string

                if (fitSentence.trim() === captionText.trim()) { // if the chunk matches the text exactly we can add the translated version

                  thisTransCaption = new captionMeta(caption.start, caption.stop, captionSentence);
                  transCaptionArr.push(thisTransCaption);

                  //console.log("-----{}{}{}{}{}{}-----");
                  //console.log("case 3 ...");
                  //console.log(caption.start + "-->" + caption.stop + "\n" + captionSentence);
                  
                  transCaptionsVtt += "\n" + caption.start + "-->" + caption.stop + "\n" + insertLineBreak(captionSentence) + "\n";
                  //console.log("this sentence = "+thisSentence);
                  remainingSentence = thisSentence.substr(fitSentence.length);
                  remainingTransSentence = thisTransSentence.substr(captionSentence.length);

                } else {
                  // add remaining text to matching chunk until we fit the caption text
                  // split next chunk into words

                  let thisSentenceWords = sentenceSplit[chunkIndex].trim().split(" ");
                  let thisTransSentenceWords = transSentenceSplit[chunkIndex].trim().split(" ");

                  //console.log(thisSentenceWords);
                  //console.log(thisTransSentenceWords);
                
                  let testingSentence = "";
                  let buildingSentence = fitSentence + " ";
                  let buildingTransSentence = fitTransSentence + " ";

                  thisSentenceWords.forEach(function(word, i) {
                    //add spaces between words
                    if (i > 0) {
                      testingSentence += " ";
                    }
  
                    testingSentence += thisSentenceWords[i];
  
                    if (captionText.indexOf(testingSentence.trim()) >= 0) {
                      buildingSentence += thisSentenceWords[i] + " ";

                      if (typeof thisTransSentenceWords[i] !== 'undefined') {
                        buildingTransSentence += thisTransSentenceWords[i] + " ";
                      }
                    }
                  });

                  thisTransCaption = new captionMeta(caption.start, caption.stop, buildingTransSentence);
                  transCaptionArr.push(thisTransCaption);
  
                  //console.log("-----{}{}{}{}{}{}-----");
                  //console.log("case 4 ...");
                  //console.log(caption.start + "-->" + caption.stop + "\n" + buildingTransSentence);
                  transCaptionsVtt += "\n" + caption.start + "-->" + caption.stop + "\n" + insertLineBreak(buildingTransSentence) + "\n";
  
                  //console.log("constructing the remaining sentences .........");
                  //console.log("thisSentence = "+thisSentence);
                  //console.log("buildingSentence.length = "+buildingSentence.length);
  
                  remainingSentence = thisSentence.substr(buildingSentence.length);
                  remainingTransSentence = thisTransSentence.substr(buildingTransSentence.length);
                }

              } else { // assume that chunk is longer than caption text or chunks couldn't be matched, split into wordds

                let thisSentenceWords = thisSentence.split(" ");
                let thisTransSentenceWords = thisTransSentence.split(" ");

                // build up matching partial sentence
                
                let testingSentence = "";
                let buildingSentence = "";
                let buildingTransSentence = "";                

                thisSentenceWords.forEach(function(word, i) {
                  //add spaces between words
                  if (i > 0) {
                    testingSentence += " ";
                  }

                  testingSentence += thisSentenceWords[i];

                  if (captionText.indexOf(testingSentence.trim()) >= 0) {
                    buildingSentence += thisSentenceWords[i] + " ";

                    if (typeof thisTransSentenceWords[i] !== 'undefined') {
                      buildingTransSentence += thisTransSentenceWords[i] + " ";
                    }
                  }
                });

                thisTransCaption = new captionMeta(caption.start, caption.stop, buildingTransSentence);
                transCaptionArr.push(thisTransCaption);

                //console.log("-----{}{}{}{}{}{}-----");
                //console.log("case 5 ...");
                //console.log(caption.start + "-->" + caption.stop + "\n" + buildingTransSentence);

                transCaptionsVtt += "\n" + caption.start + "-->" + caption.stop + "\n" + insertLineBreak(buildingTransSentence) + "\n";

                //console.log("constructing the remaining sentences .........");
                //console.log("thisSentence = "+thisSentence);
                //console.log("thisTransSentence = "+thisTransSentence);
                //console.log("buildingSentence.length = "+buildingSentence.length);

                remainingSentence = thisSentence.substr(buildingSentence.length);
                remainingTransSentence = thisTransSentence.substr(buildingTransSentence.length);
              }

              //console.log("remainingSentence = "+remainingSentence);
              //console.log("remainingTransSentence = "+remainingTransSentence);
            }

            //console.log("================================================================");
            //console.log("moving on to next caption, starting from sentence "+sentenceIndex);
            break;
          }
        }
      }

      //console.log(transCaptionsVtt);
    });

    //console.log("finished");
    //console.log(captionsVtt);

    return(transCaptionArr);
  }

  function vttTimeToMs(vttTime){
    let part = vttTime.split(".");
    let a = part[0].split(":");
    let seconds = (+a[0]) * 60 * 60 + (+a[1]) * 60 + (+a[2]); 
    let ms = seconds * 1000 + (+part[1]);
    return ms;
  }

  return trans;
});