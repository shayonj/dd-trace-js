#include <nan.h>

// extern "C" {
//   #include <tdigest/tdigest.h>
// }

#include "EventLoop.hpp"
#include "GarbageCollection.hpp"
#include "Heap.hpp"
#include "Object.hpp"
#include "Process.hpp"
#include "SpanTracker.hpp"

namespace datadog {
  namespace {
    EventLoop eventLoop;
    GarbageCollection gc;
    Heap heap;
    Process process;
    SpanTracker tracker;

    NAN_GC_CALLBACK(before_gc) {
      gc.before(type);
    }

    NAN_GC_CALLBACK(after_gc) {
      gc.after(type);
    }

    NAN_METHOD(start) {
      bool debug = false;

      if (info.Length() > 0 && info[0]->IsBoolean()) {
        debug = v8::Local<v8::Boolean>::Cast(info[0])->Value();
      }

      eventLoop.enable();
      tracker.enable(debug);

      Nan::AddGCPrologueCallback(before_gc);
      Nan::AddGCEpilogueCallback(after_gc);
    }

    NAN_METHOD(stop) {
      eventLoop.disable();
      tracker.disable();

      Nan::RemoveGCPrologueCallback(before_gc);
      Nan::RemoveGCEpilogueCallback(after_gc);
    }

    NAN_METHOD(stats) {
      Object obj;

      eventLoop.inject(obj);
      gc.inject(obj);
      process.inject(obj);
      heap.inject(obj);
      tracker.inject(obj);

      info.GetReturnValue().Set(obj.to_json());
    }

    NAN_METHOD(track) {
      SpanHandle *handle = tracker.track(v8::Local<v8::Object>::Cast(info[0]));
      v8::Isolate *isolate = v8::Isolate::GetCurrent();

      info.GetReturnValue().Set(v8::External::New(isolate, handle));
    }

    NAN_METHOD(finish) {
      SpanHandle *handle = static_cast<SpanHandle*>(v8::Local<v8::External>::Cast(info[0])->Value());

      tracker.finish(handle);
    }

    NAN_METHOD(bench) {
      // td_histogram_t *h = td_new(1000);

      // for (int i = 0; i < 10000; i++) {
      //   td_add(h, i, 1);
      // }

      // printf("p50: %i\n", (int)td_quantile_of(h, 0.50));
      // printf("p95: %i\n", (int)td_value_at(h, 0.95));
    }
  }

  NAN_MODULE_INIT(init) {
    Object obj = Object(target);

    obj.set("start", start);
    obj.set("stop", stop);
    obj.set("stats", stats);
    obj.set("track", track);
    obj.set("finish", finish);
    obj.set("bench", bench);
  }

  NODE_MODULE(metrics, init);
}