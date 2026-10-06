// 수업용 예제 — 모두 실제 파이썬에서도 문법 오류 없이 동작한다 (tests/examples.test.ts에서 확인)

export interface Example {
  id: string;
  title: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'max2',
    title: '두 수 중 큰 수',
    code: `a = int(input("첫 번째 수: "))
b = int(input("두 번째 수: "))
if a > b:
    큰수 = a
else:
    큰수 = b
print(큰수)
`,
  },
  {
    id: 'sum',
    title: '1부터 n까지의 합',
    code: `n = int(input("n을 입력하세요: "))
합 = 0
for i in range(1, n + 1):
    합 = 합 + i
if 합 > 100:
    print("크다")
elif 합 == 100:
    print("같다")
else:
    print("작다")
print(합)
`,
  },
  {
    id: 'evenodd',
    title: '짝수/홀수 판별',
    code: `n = int(input())
if n % 2 == 0:
    print("짝수")
else:
    print("홀수")
`,
  },
  {
    id: 'gugudan',
    title: '구구단 (중첩 반복)',
    code: `for 단 in range(2, 10):
    for i in range(1, 10):
        print(단, "x", i, "=", 단 * i)
`,
  },
  {
    id: 'max',
    title: '최댓값 찾기 (리스트)',
    code: `점수 = [72, 95, 88, 61]
최댓값 = 점수[0]
for x in 점수:
    if x > 최댓값:
        최댓값 = x
print(최댓값)
`,
  },
  {
    id: 'digits',
    title: '자릿수의 합 (while)',
    code: `n = int(input())
합 = 0
while n > 0:
    합 += n % 10
    n //= 10
print(합)
`,
  },
  {
    id: 'guess',
    title: '숫자 맞히기 (break)',
    code: `정답 = 7
while True:
    추측 = int(input("숫자: "))
    if 추측 == 정답:
        print("정답!")
        break
    print("다시 시도하세요")
`,
  },
  {
    id: 'bubble',
    title: '버블 정렬',
    code: `a = [5, 3, 8, 1, 4]
n = len(a)
for i in range(n - 1):
    for j in range(n - 1 - i):
        if a[j] > a[j + 1]:
            a[j], a[j + 1] = a[j + 1], a[j]
print(a)
`,
  },
];
