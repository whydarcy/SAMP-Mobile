#pragma once
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
namespace SileUiWire {
struct Command {uint16_t style=0;uint32_t type=0;std::vector<std::string> args;};
inline bool Decode(const uint8_t* data,size_t size,Command& out) {
    if(!data||size<8||size>262144||data[0]!=215)return false;
    Command result;result.style=uint16_t(data[1])|(uint16_t(data[2])<<8);
    result.type=uint32_t(data[3])|(uint32_t(data[4])<<8)|(uint32_t(data[5])<<16)|(uint32_t(data[6])<<24);
    if(result.style!=2||data[7]>8)return false;
    size_t pos=8;
    for(int i=0;i<data[7];++i){
        if(size-pos<4)return false;uint32_t length=uint32_t(data[pos])|(uint32_t(data[pos+1])<<8)|(uint32_t(data[pos+2])<<16)|(uint32_t(data[pos+3])<<24);pos+=4;
        if(length>65536||length>size-pos)return false;
        std::string value(reinterpret_cast<const char*>(data+pos),length);pos+=length;
        if(value.find('\0')!=std::string::npos)return false;result.args.push_back(std::move(value));
    }
    if(pos!=size)return false;out=std::move(result);return true;
}
struct Argument {uint8_t type=0;std::string text;int32_t integer=0;float number=0;};
inline void U32(std::vector<uint8_t>& p,uint32_t n){for(int i=0;i<4;++i)p.push_back((n>>(8*i))&255);}
inline void String32(std::vector<uint8_t>& p,const std::string& s){U32(p,s.size());p.insert(p.end(),s.begin(),s.end());}
inline std::vector<uint8_t> EncodeEvent(const std::string& name,const std::vector<Argument>& args){
    if(name.empty()||name.size()>96||args.size()>32)return {};
    for(char c:name)if(!((c>='A'&&c<='Z')||(c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='_'))return {};
    std::vector<uint8_t> p={215,2,0,0,0,0,0};String32(p,name);U32(p,args.size());
    for(const auto& arg:args){
        if(arg.type>2)return {};p.push_back(arg.type);
        if(arg.type==0){if(arg.text.size()>8192||arg.text.find('\0')!=std::string::npos)return {};String32(p,arg.text);}
        else if(arg.type==2)U32(p,static_cast<uint32_t>(arg.integer));
        else {uint32_t value;static_assert(sizeof(float)==4);std::memcpy(&value,&arg.number,4);U32(p,value);}
    }
    if(p.size()>16384)return {};return p;
}
}
