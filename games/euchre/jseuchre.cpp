#include <node.h>
#include <node_object_wrap.h>

#include "cores/markov/core_markov.h"
#include "cores/random/core_random.h"

template<typename CoreType, std::string& className>
class JsEuchreCore : public node::ObjectWrap {
public:
    static void Init(v8::Local<v8::Object> exports);

private:
    JsEuchreCore(EuchreConfig config) {
        core = std::make_unique<CoreType>(config);
        core->initialize();
    }

    static void New(const v8::FunctionCallbackInfo<v8::Value>& args);

    static void run(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void gameSetup(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void deal(const v8::FunctionCallbackInfo<v8::Value>& args);

    std::unique_ptr<CoreType> core;
};

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::Init(v8::Local<v8::Object> exports) {
    v8::Isolate* isolate = exports->GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    v8::Local<v8::ObjectTemplate> addon_data_tpl = v8::ObjectTemplate::New(isolate);
    addon_data_tpl->SetInternalFieldCount(1);
    v8::Local<v8::Object> addon_data = addon_data_tpl->NewInstance(context).ToLocalChecked();

    // Prepare constructor template
    v8::Local<v8::FunctionTemplate> tpl = v8::FunctionTemplate::New(isolate, New, addon_data);
    tpl->SetClassName(v8::String::NewFromUtf8(isolate, className.c_str()));
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

    // Prototype
    NODE_SET_PROTOTYPE_METHOD(tpl, "run", run);
    NODE_SET_PROTOTYPE_METHOD(tpl, "gameSetup", gameSetup);
    NODE_SET_PROTOTYPE_METHOD(tpl, "deal", deal);

    v8::Local<v8::Function> constructor = tpl->GetFunction(context).ToLocalChecked();
    addon_data->SetInternalField(0, constructor);
    exports->Set(context, v8::String::NewFromUtf8(isolate, className.c_str()), constructor).FromJust();
}

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::New(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    EuchreConfig config;
    JsEuchreCore<CoreType, className>* obj = new JsEuchreCore<CoreType, className>(config);
    obj->Wrap(args.This());
    args.GetReturnValue().Set(args.This());
}

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::run(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    JsEuchreCore<CoreType, className>* obj = ObjectWrap::Unwrap<JsEuchreCore<CoreType, className>>(args.Holder());
    obj->core->run("");
    
    std::vector<int>& scoresCpp = obj->core->scores;
    v8::Local<v8::Array> scores = v8::Array::New(isolate, scoresCpp.size());
    for (int i = 0; i < (int)scoresCpp.size(); i++) {
        scores->Set(context, i, v8::Number::New(isolate, scoresCpp[i]));
    }

    args.GetReturnValue().Set(scores);
}

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::gameSetup(const v8::FunctionCallbackInfo<v8::Value>& args) {
    JsEuchreCore<CoreType, className>* obj = ObjectWrap::Unwrap<JsEuchreCore<CoreType, className>>(args.Holder());
    obj->core->gameSetup();
}

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::deal(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    JsEuchreCore<CoreType, className>* obj = ObjectWrap::Unwrap<JsEuchreCore<CoreType, className>>(args.Holder());
    obj->core->dealSetup();
    obj->core->deal();

    // Return data
    v8::Local<v8::Object> ret = v8::Object::New(isolate);

    // hands
    v8::Local<v8::Array> hands = v8::Array::New(isolate, obj->core->config.N);
    for (int i = 0; i < obj->core->config.N; i++) {
        auto& player = obj->core->players[i];
        v8::Local<v8::Array> hand = v8::Array::New(isolate, obj->core->config.h);
        int j = 0;
        for (auto& card : player->hand) {
            hand->Set(context, j, v8::Number::New(isolate, card.code));
            j++;
        }
        hands->Set(context, i, hand);
    }
    ret->Set(context, v8::String::NewFromUtf8(isolate, "hands"), hands);

    // up card
    ret->Set(context, v8::String::NewFromUtf8(isolate, "upCard"), v8::Number::New(isolate, obj->core->upCard.code));

    // dealer
    int dealer = obj->core->roundNumber % obj->core->config.N;
    ret->Set(context, v8::String::NewFromUtf8(isolate, "dealer"), v8::Number::New(isolate, dealer));

    // leader
    ret->Set(context, v8::String::NewFromUtf8(isolate, "leader"), v8::Number::New(isolate, obj->core->leader));

    args.GetReturnValue().Set(ret);
}

std::string JsEuchreCoreRandomClassName = "EuchreCoreRandom";
using JsEuchreCoreRandom = JsEuchreCore<EuchreCoreRandom, JsEuchreCoreRandomClassName>;

std::string JsEuchreCoreMarkovClassName = "EuchreCoreMarkov";
using JsEuchreCoreMarkov = JsEuchreCore<EuchreCoreMarkov, JsEuchreCoreMarkovClassName>;

void InitAll(v8::Local<v8::Object> exports) {
    JsEuchreCoreRandom::Init(exports);
    JsEuchreCoreMarkov::Init(exports);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, InitAll)
